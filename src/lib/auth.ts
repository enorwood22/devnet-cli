import chalk from "chalk";
import config from "./config.js";

function serverUrl(): string {
  return config.get("serverUrl").replace(/^wss?:\/\//, "https://");
}

function tokenExpiresAt(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.exp * 1000;
  } catch {
    return 0;
  }
}

function isTokenExpired(token: string): boolean {
  if (!token) return true;
  // Treat as expired 60s early to avoid edge-case failures mid-connect
  return Date.now() >= tokenExpiresAt(token) - 60_000;
}

export async function checkHealth(): Promise<void> {
  const url = `${serverUrl()}/health`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Cannot reach relay server at ${serverUrl()}. Is it running?`);
  }
  if (!res.ok) throw new Error(`Relay server returned ${res.status}. Check server logs.`);
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${serverUrl()}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json() as {
    token?: string; refreshToken?: string;
    email?: string; userId?: string; error?: string;
  };

  if (!res.ok) throw new Error(data.error ?? "Login failed");

  config.set("authToken", data.token!);
  config.set("refreshToken", data.refreshToken!);
  config.set("userId", data.userId!);
  config.set("email", data.email!);
}

async function refreshToken(): Promise<void> {
  const storedRefresh = config.get("refreshToken");
  if (!storedRefresh) throw new Error("No refresh token stored. Please log in again.");

  const res = await fetch(`${serverUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: storedRefresh }),
  });

  const data = await res.json() as { token?: string; refreshToken?: string; error?: string };

  if (!res.ok) {
    // Refresh token itself is expired — clear session so next check shows logged out
    config.set("authToken", "");
    config.set("refreshToken", "");
    throw new Error("Session expired. Please run: devnet login");
  }

  config.set("authToken", data.token!);
  config.set("refreshToken", data.refreshToken!);
}

// Call this before any authenticated operation — silently refreshes if needed.
// If the session cannot be refreshed, prints a clean message and exits so
// callers never see a raw Node.js stack trace.
export async function ensureValidToken(): Promise<string> {
  const token = config.get("authToken");
  if (isTokenExpired(token)) {
    try {
      await refreshToken();
    } catch (err) {
      console.error(chalk.red(`\n  ${(err as Error).message}\n`));
      process.exit(1);
    }
  }
  return config.get("authToken");
}

export async function logout(): Promise<void> {
  const token = config.get("authToken");
  if (token) {
    await fetch(`${serverUrl()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  config.set("authToken", "");
  config.set("refreshToken", "");
  config.set("userId", "");
  config.set("email", "");
}

export function getToken(): string {
  return config.get("authToken");
}

export function isLoggedIn(): boolean {
  return Boolean(config.get("authToken")) || Boolean(config.get("refreshToken"));
}
