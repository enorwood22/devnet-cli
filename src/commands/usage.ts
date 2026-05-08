import chalk from "chalk";
import config from "../lib/config.js";
import { ensureValidToken, isLoggedIn } from "../lib/auth.js";

interface UsageResponse {
  plan: string;
  bandwidthUsed: number;
  bandwidthLimit: number;
  bandwidthResetAt: string;
  maxTtlSeconds: number;
  tunnelLimit: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatTtl(seconds: number): string {
  if (seconds < 3600) return `${seconds / 60}m`;
  return `${seconds / 3600}h`;
}

function usageBar(used: number, limit: number, width = 24): string {
  const pct = Math.min(used / limit, 1);
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = pct >= 0.9 ? chalk.red : pct >= 0.7 ? chalk.yellow : chalk.green;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

export async function usageCommand(): Promise<void> {
  if (!isLoggedIn()) {
    console.error(chalk.red("  Not logged in. Run: devnet login"));
    process.exit(1);
  }

  const token = await ensureValidToken();
  const serverUrl = config.get("serverUrl").replace(/^wss?:\/\//, "https://");

  let data: UsageResponse;
  try {
    const res = await fetch(`${serverUrl}/tunnels/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    data = await res.json() as UsageResponse;
  } catch (err) {
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }

  const { plan, bandwidthUsed, bandwidthLimit, bandwidthResetAt, maxTtlSeconds, tunnelLimit } = data;
  // bandwidthResetAt is the start of the current billing period.
  // Show when the NEXT reset happens: first day of the following month.
  const periodStart = new Date(bandwidthResetAt);
  const nextReset = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
  const resetDate = nextReset.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const pct = Math.min(bandwidthUsed / bandwidthLimit, 1);

  console.log();
  console.log(`  ${chalk.bold("Plan")}        ${plan === "pro" ? chalk.green("Pro") : chalk.gray("Free")}`);
  console.log(`  ${chalk.bold("Tunnels")}     up to ${tunnelLimit} concurrent`);
  console.log(`  ${chalk.bold("Max TTL")}     ${formatTtl(maxTtlSeconds)}`);
  console.log();
  console.log(`  ${chalk.bold("Bandwidth")}   ${formatBytes(bandwidthUsed)} of ${formatBytes(bandwidthLimit)} used`);
  console.log(`  ${" ".repeat(13)}${usageBar(bandwidthUsed, bandwidthLimit)}  ${chalk.gray(`${Math.round(pct * 100)}%`)}`);
  console.log(`  ${" ".repeat(13)}${chalk.gray(`Resets ${resetDate}`)}`);
  if (plan === "free") {
    console.log();
    console.log(chalk.gray("  Upgrade to Pro for 5 tunnels, 24h TTL, and 10 GB bandwidth."));
    console.log(chalk.gray("  devnet.sh/#pricing"));
  }
  console.log();
}
