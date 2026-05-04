import chalk from "chalk";
import ora from "ora";
import { isLoggedIn } from "../lib/auth.js";
import { openTunnel } from "../lib/tunnel.js";
import type { TtlChoice, TunnelOptions } from "../types.js";

const TTL_MAP: Record<string, TtlChoice> = {
  "15m": 900,
  "1h": 3600,
  "24h": 86400,
};

interface ShareFlags {
  ttl: string;
  invite?: string;
  password?: string;
  allowIp?: string[];
  open?: boolean;
}

export async function shareCommand(port: string, flags: ShareFlags): Promise<void> {
  if (!isLoggedIn()) {
    console.error(chalk.red("  Not logged in. Run: devnet login"));
    process.exit(1);
  }

  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    console.error(chalk.red(`  Invalid port: ${port}`));
    process.exit(1);
  }

  const ttl = TTL_MAP[flags.ttl];
  if (!ttl) {
    console.error(chalk.red(`  Invalid TTL. Choose: 15m, 1h, 24h`));
    process.exit(1);
  }

  const options: TunnelOptions = {
    port: portNum,
    ttl,
    invite: flags.invite,
    password: flags.password,
    allowIp: flags.allowIp,
    open: flags.open,
  };

  const spinner = ora(`Connecting to relay server...`).start();

  try {
    spinner.stop();
    await openTunnel(options);
  } catch (err: unknown) {
    spinner.stop();
    const msg = (err as Error).message ?? "Unknown error";

    // Session-related errors get a specific prompt
    if (msg.toLowerCase().includes("session expired") || msg.toLowerCase().includes("no refresh token")) {
      console.error(chalk.yellow("\n  Session expired.") + chalk.gray(" Run: ") + chalk.white("devnet login"));
    } else {
      console.error(chalk.red(`\n  Error: ${msg}`));
    }
    process.exit(1);
  }
}
