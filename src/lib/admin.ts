import chalk from "chalk";
import config from "./config.js";

function adminUrl(path: string): string {
  const base = config.get("serverUrl").replace(/^wss?:\/\//, "https://");
  return `${base}/admin${path}`;
}

function getAdminSecret(): string {
  const secret = config.get("adminSecret");
  if (!secret) {
    console.error(chalk.red("\n  Admin secret not configured."));
    console.error(chalk.gray("  Run: devnet admin configure\n"));
    process.exit(1);
  }
  return secret;
}

export async function adminFetch(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const secret = getAdminSecret();
  const opts: RequestInit = {
    method,
    headers: {
      "X-Admin-Secret": secret,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  };
  if (body) opts.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(adminUrl(path), opts);
  } catch {
    console.error(chalk.red("\n  Could not reach relay server. Is it running?\n"));
    process.exit(1);
  }

  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const msg = (data.error as string) ?? `Server returned ${res.status}`;
    console.error(chalk.red(`\n  Error: ${msg}\n`));
    process.exit(1);
  }

  return data;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
