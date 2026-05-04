import WebSocket from "ws";
import http from "http";
import { exec } from "child_process";
import chalk from "chalk";
import config from "./config.js";
import { ensureValidToken } from "./auth.js";
import { promptApproval } from "./approval.js";
import { generateClientKeypair, deriveSharedKey, encryptBody, decryptBody } from "./encryption.js";
import type { TunnelOptions, WsMessage } from "../types.js";

const MAX_RECONNECT_ATTEMPTS = 6;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function openInBrowser(url: string): void {
  const cmd =
    process.platform === "win32" ? `cmd /c start "" "${url}"` :
    process.platform === "darwin" ? `open "${url}"` :
    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error(chalk.gray(`  Could not open browser: ${err.message}`));
  });
}

export async function openTunnel(options: TunnelOptions): Promise<void> {
  let reclaimId: string | null = null;
  let attempt = 0;

  while (true) {
    if (attempt > 0) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 16_000);
      process.stdout.write(chalk.yellow(`\n  Reconnecting in ${delay / 1000}s...`));
      await sleep(delay);
      process.stdout.write("\n");
    }

    const result = await connectOnce(options, reclaimId);

    if (result.intentional) return;

    attempt++;
    if (result.tunnelId) reclaimId = result.tunnelId;

    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      console.error(chalk.red(`\n  Could not reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts. Giving up.\n`));
      process.exit(1);
    }

    console.log(chalk.yellow(`  Connection lost. Attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}...`));
  }
}

interface ConnectResult {
  intentional: boolean;
  tunnelId?: string;
}

async function connectOnce(options: TunnelOptions, reclaimId: string | null): Promise<ConnectResult> {
  const serverUrl = config.get("serverUrl");
  const token = await ensureValidToken();

  // Generate ECDH keypair for E2E encryption
  const keypair = generateClientKeypair();
  let encKey: Buffer | null = null;

  return new Promise((resolve) => {
    let intentionalClose = false;
    let tunnelId: string | null = reclaimId;
    let sigintHandler: (() => void) | null = null;

    const ws = new WebSocket(`${serverUrl}/tunnel`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    ws.on("open", () => {
      if (reclaimId) {
        ws.send(JSON.stringify({ type: "tunnel:reclaim", tunnelId: reclaimId }));
      } else {
        ws.send(JSON.stringify({
          type: "tunnel:open",
          port: options.port,
          ttl: options.ttl,
          password: options.password,
          allowIp: options.allowIp,
          invite: options.invite,
          clientPublicKey: keypair.publicKey,
        }));
      }
    });

    ws.on("message", async (raw) => {
      const msg: WsMessage = JSON.parse(raw.toString());

      switch (msg.type) {
        case "tunnel:registered":
          tunnelId = msg.tunnelId;
          // Derive shared encryption key if server responded with its public key
          if (msg.serverPublicKey) {
            try {
              encKey = deriveSharedKey(keypair.privateKey, msg.serverPublicKey);
              console.log(chalk.gray("  E2E encryption active"));
            } catch {
              console.warn(chalk.yellow("  Warning: E2E key derivation failed — proceeding unencrypted"));
            }
          }
          if (reclaimId) {
            console.log(chalk.green("  Reconnected — same URL still active"));
          } else {
            console.log(chalk.green("\n  Tunnel active!"));
            console.log(chalk.bold(`  URL:     ${msg.url}`));
            console.log(chalk.gray(`  Expires: ${new Date(msg.expiresAt).toLocaleString()}\n`));
            if (options.open) openInBrowser(msg.url);
          }
          break;

        case "tunnel:expired":
          intentionalClose = true;
          console.log(chalk.yellow("\n  Tunnel expired. Closing.\n"));
          ws.close(1000);
          break;

        case "conn:request": {
          if (msg.autoApproved) {
            forwardToLocalhost(options.port, msg, encKey).then((response) => {
              ws.send(JSON.stringify({ type: "conn:response", connectionId: msg.connectionId, ...response }));
            });
          } else {
            const approved = await promptApproval(msg);
            ws.send(JSON.stringify({
              type: approved ? "conn:approve" : "conn:deny",
              connectionId: msg.connectionId,
            }));
            if (approved) {
              forwardToLocalhost(options.port, msg, encKey).then((response) => {
                ws.send(JSON.stringify({ type: "conn:response", connectionId: msg.connectionId, ...response }));
              });
            }
          }
          break;
        }

        case "conn:blocked":
          if (msg.reason === "ip") {
            console.log(chalk.red(`  ✕ IP blocked: ${msg.ip} (${msg.device})`));
          } else {
            console.log(chalk.red(`  ✕ Wrong password: ${msg.device} from ${msg.ip}`));
          }
          break;

        case "conn:authed":
          console.log(chalk.green(`  ✓ Password accepted: ${msg.device} from ${msg.ip}`));
          break;

        case "error":
          console.error(chalk.red(`  Server error: ${msg.message}`));
          intentionalClose = true;
          ws.close(1000);
          break;
      }
    });

    ws.on("close", (code) => {
      if (sigintHandler) process.removeListener("SIGINT", sigintHandler);
      resolve({ intentional: intentionalClose || code === 1000, tunnelId: tunnelId ?? undefined });
    });

    ws.on("error", (err) => {
      console.error(chalk.red(`  WebSocket error: ${err.message}`));
    });

    sigintHandler = () => {
      intentionalClose = true;
      console.log(chalk.gray("\n  Closing tunnel..."));
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "tunnel:close" }));
      }
      ws.close(1000);
    };
    process.once("SIGINT", sigintHandler);
  });
}

async function forwardToLocalhost(
  port: number,
  req: Extract<WsMessage, { type: "conn:request" }>,
  encKey: Buffer | null
): Promise<{ status: number; headers: Record<string, string>; body: string; bodyNonce?: string }> {
  // Decrypt the incoming request body if E2E encryption is active
  let requestBodyBuffer: Buffer | null = null;
  if (req.body) {
    if (encKey && req.bodyNonce) {
      try {
        requestBodyBuffer = Buffer.from(decryptBody(encKey, req.body, req.bodyNonce), "base64");
      } catch {
        requestBodyBuffer = Buffer.from(req.body, "base64");
      }
    } else {
      requestBodyBuffer = Buffer.from(req.body, "base64");
    }
  }

  return new Promise((resolve) => {
    const proxyReq = http.request(
      { hostname: "127.0.0.1", port, path: req.path, method: req.method, headers: req.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const rawBody = Buffer.concat(chunks).toString("base64");
          // Encrypt the response body if E2E encryption is active
          if (encKey && rawBody) {
            const encrypted = encryptBody(encKey, rawBody);
            resolve({
              status: res.statusCode ?? 200,
              headers: res.headers as Record<string, string>,
              body: encrypted.body,
              bodyNonce: encrypted.bodyNonce,
            });
          } else {
            resolve({ status: res.statusCode ?? 200, headers: res.headers as Record<string, string>, body: rawBody });
          }
        });
      }
    );

    proxyReq.on("error", () => {
      resolve({ status: 502, headers: {}, body: btoa("Bad Gateway") });
    });

    if (requestBodyBuffer) proxyReq.write(requestBodyBuffer);
    proxyReq.end();
  });
}
