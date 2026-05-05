import chalk from "chalk";
import config from "../lib/config.js";
import { ensureValidToken, isLoggedIn } from "../lib/auth.js";

interface TunnelEntry {
  id: string;
  url: string;
  port: number;
  ttl: number;
  expiresAt: string;
  remainingSeconds: number;
}

interface TunnelsResponse {
  tunnels: TunnelEntry[];
  plan: string;
  limit: number;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return chalk.red("expired");
  if (seconds < 60) return chalk.yellow(`${seconds}s`);
  if (seconds < 3600) return chalk.yellow(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return chalk.green(`${h}h ${m}m`);
}

export async function activeCommand(): Promise<void> {
  if (!isLoggedIn()) {
    console.error(chalk.red("  Not logged in. Run: devnet login"));
    process.exit(1);
  }

  const token = await ensureValidToken();
  const serverUrl = config.get("serverUrl").replace(/^wss?:\/\//, "https://");

  let data: TunnelsResponse;
  try {
    const res = await fetch(`${serverUrl}/tunnels`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    data = await res.json() as TunnelsResponse;
  } catch (err) {
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }

  const { tunnels, plan, limit } = data;

  console.log(chalk.gray(`\n  Plan: ${plan}  ·  ${tunnels.length}/${limit} active tunnels\n`));

  if (tunnels.length === 0) {
    console.log(chalk.gray("  No active tunnels. Run: devnet share <port>\n"));
    return;
  }

  for (const t of tunnels) {
    console.log(
      `  ${chalk.bold.white(t.url)}  ${chalk.gray(`→ localhost:${t.port}`)}  ${formatRemaining(t.remainingSeconds)}`
    );
  }
  console.log();
}
