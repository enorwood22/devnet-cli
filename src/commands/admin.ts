import chalk from "chalk";
import * as readline from "readline";
import config from "../lib/config.js";
import { adminFetch, formatBytes, formatDate } from "../lib/admin.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (hidden) {
      process.stdout.write(question);
      process.stdin.setRawMode?.(true);
      let value = "";
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      const onData = (ch: string) => {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(value);
        } else if (ch === "") {
          process.exit();
        } else if (ch === "") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      };
      process.stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => { rl.close(); resolve(answer); });
    }
  });
}

function usageBar(pct: number, width = 20): string {
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const color = pct >= 0.9 ? chalk.red : pct >= 0.7 ? chalk.yellow : chalk.green;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

// ── Commands ─────────────────────────────────────────────────────────────────

/** devnet admin configure — store admin secret */
export async function adminConfigure(): Promise<void> {
  const current = config.get("serverUrl");
  console.log();
  console.log(chalk.bold("  Admin Setup"));
  console.log(chalk.gray(`  Current server URL: ${current}`));
  console.log();

  const serverUrl = await prompt(`  Server URL [${current}]: `);
  if (serverUrl.trim()) config.set("serverUrl", serverUrl.trim());

  const secret = await prompt("  Admin secret: ", true);
  if (!secret.trim()) {
    console.error(chalk.red("  Secret cannot be empty."));
    process.exit(1);
  }
  config.set("adminSecret", secret.trim());

  console.log(chalk.green("\n  ✓ Admin credentials saved.\n"));
}

/** devnet admin stats */
export async function adminStats(): Promise<void> {
  const data = await adminFetch("GET", "/stats") as {
    server: { uptime: number; memoryMB: number };
    tunnels: { active: number; totalAllTime: number; createdToday: number };
    users: { total: number; pro: number; free: number; banned: number };
    bandwidth: { totalUsedBytes: number; totalUsedFormatted: string };
  };

  const uptimeMins = Math.floor(data.server.uptime / 60);
  const uptimeHrs  = Math.floor(uptimeMins / 60);
  const uptimeStr  = uptimeHrs > 0
    ? `${uptimeHrs}h ${uptimeMins % 60}m`
    : `${uptimeMins}m`;

  console.log();
  console.log(chalk.bold("  Server"));
  console.log(`    Uptime     ${uptimeStr}`);
  console.log(`    Memory     ${data.server.memoryMB} MB`);
  console.log();
  console.log(chalk.bold("  Tunnels"));
  console.log(`    Active     ${chalk.green(data.tunnels.active)}`);
  console.log(`    Today      ${data.tunnels.createdToday}`);
  console.log(`    All-time   ${data.tunnels.totalAllTime}`);
  console.log();
  console.log(chalk.bold("  Users"));
  console.log(`    Total      ${data.users.total}`);
  console.log(`    Pro        ${chalk.green(data.users.pro)}`);
  console.log(`    Free       ${chalk.gray(data.users.free)}`);
  console.log(`    Banned     ${data.users.banned > 0 ? chalk.red(data.users.banned) : chalk.gray(0)}`);
  console.log();
  console.log(chalk.bold("  Bandwidth (this period)"));
  console.log(`    Used       ${data.bandwidth.totalUsedFormatted}`);
  console.log();
}

/** devnet admin user <email> */
export async function adminUser(email: string): Promise<void> {
  // First resolve email → id via users list
  const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
  const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) {
    console.error(chalk.red(`\n  No user found with email: ${email}\n`));
    process.exit(1);
  }

  const u = await adminFetch("GET", `/users/${match.id}`) as {
    id: string; email: string; createdAt: string; lastSignIn: string;
    banned: boolean; bannedUntil: string | null; plan: string;
    bandwidth: {
      usedBytes: number; usedFormatted: string;
      limitBytes: number; limitFormatted: string;
      percentUsed: number; nextResetAt: string;
    };
    tunnels: { active: number; limit: number; totalAllTime: number; live: Array<{ id: string; url: string; port: number; expiresAt: string }> };
    recentActivity: Array<{ event: string; created_at: string; metadata: Record<string, string> }>;
  };

  const bwPct = u.bandwidth.percentUsed / 100;

  console.log();
  console.log(chalk.bold(`  ${u.email}`));
  console.log(chalk.gray(`  ID: ${u.id}`));
  console.log();
  console.log(chalk.bold("  Account"));
  console.log(`    Plan       ${u.plan === "pro" ? chalk.green("Pro") : chalk.gray("Free")}`);
  console.log(`    Status     ${u.banned ? chalk.red("BANNED") : chalk.green("Active")}`);
  console.log(`    Created    ${formatDate(u.createdAt)}`);
  console.log(`    Last login ${formatDate(u.lastSignIn)}`);
  console.log();
  console.log(chalk.bold("  Bandwidth"));
  console.log(`    Used       ${u.bandwidth.usedFormatted} / ${u.bandwidth.limitFormatted}`);
  console.log(`    ${" ".repeat(11)}${usageBar(bwPct)}  ${chalk.gray(`${u.bandwidth.percentUsed}%`)}`);
  console.log(`    Resets     ${formatDate(u.bandwidth.nextResetAt)}`);
  console.log();
  console.log(chalk.bold("  Tunnels"));
  console.log(`    Active     ${u.tunnels.active} / ${u.tunnels.limit}`);
  console.log(`    All-time   ${u.tunnels.totalAllTime}`);
  if (u.tunnels.live.length > 0) {
    for (const t of u.tunnels.live) {
      console.log(`    ${chalk.cyan("→")} ${t.url}  ${chalk.gray(`port ${t.port} · expires ${formatDate(t.expiresAt)}`)}`);
    }
  }
  console.log();
  if (u.recentActivity.length > 0) {
    console.log(chalk.bold("  Recent Activity"));
    for (const e of u.recentActivity) {
      const meta = Object.entries(e.metadata ?? {})
        .filter(([k]) => !["email"].includes(k))
        .map(([, v]) => v).join(" · ");
      console.log(`    ${chalk.gray(formatDate(e.created_at))}  ${e.event}${meta ? chalk.gray(`  ${meta}`) : ""}`);
    }
    console.log();
  }
}

/** devnet admin ban <email> */
export async function adminBan(email: string): Promise<void> {
  const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
  const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) { console.error(chalk.red(`\n  No user found: ${email}\n`)); process.exit(1); }

  const data = await adminFetch("POST", `/users/${match.id}/ban`) as { tunnelsKilled: number };
  console.log(chalk.red(`\n  ✓ ${email} has been banned.`));
  if (data.tunnelsKilled > 0) {
    console.log(chalk.gray(`    ${data.tunnelsKilled} live tunnel(s) terminated.`));
  }
  console.log();
}

/** devnet admin unban <email> */
export async function adminUnban(email: string): Promise<void> {
  const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
  const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) { console.error(chalk.red(`\n  No user found: ${email}\n`)); process.exit(1); }

  await adminFetch("POST", `/users/${match.id}/unban`);
  console.log(chalk.green(`\n  ✓ ${email} has been unbanned.\n`));
}

/** devnet admin reset-bw <email> */
export async function adminResetBandwidth(email: string): Promise<void> {
  const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
  const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) { console.error(chalk.red(`\n  No user found: ${email}\n`)); process.exit(1); }

  await adminFetch("POST", `/users/${match.id}/reset-bandwidth`);
  console.log(chalk.green(`\n  ✓ Bandwidth reset for ${email}.\n`));
}

/** devnet admin set-plan <email> <plan> */
export async function adminSetPlan(email: string, plan: string): Promise<void> {
  if (plan !== "free" && plan !== "pro") {
    console.error(chalk.red("\n  Plan must be 'free' or 'pro'.\n"));
    process.exit(1);
  }
  await adminFetch("POST", "/set-plan", { email, plan });
  const label = plan === "pro" ? chalk.green("Pro") : chalk.gray("Free");
  console.log(`\n  ✓ ${email} → ${label}\n`);
}

/** devnet admin send-reset <email> */
export async function adminSendReset(email: string): Promise<void> {
  const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
  const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!match) { console.error(chalk.red(`\n  No user found: ${email}\n`)); process.exit(1); }

  await adminFetch("POST", `/users/${match.id}/send-password-reset`);
  console.log(chalk.green(`\n  ✓ Password reset email sent to ${email}.\n`));
}

/** devnet admin tunnels [--user email] */
export async function adminTunnels(options: { user?: string }): Promise<void> {
  const qs = options.user ? `?user=${encodeURIComponent(options.user)}` : "";
  const data = await adminFetch("GET", `/tunnels${qs}`) as {
    tunnels: Array<{
      id: string; url: string; port: number; userId: string;
      expiresAt: string; approvedDevices: number; pendingApprovals: number;
      hasPassword: boolean; allowIp: string[];
    }>;
  };

  if (data.tunnels.length === 0) {
    console.log(chalk.gray("\n  No active tunnels.\n"));
    return;
  }

  console.log();
  console.log(chalk.bold(`  Active tunnels (${data.tunnels.length})`));
  console.log();
  for (const t of data.tunnels) {
    const tags = [
      t.hasPassword && chalk.yellow("password"),
      t.allowIp.length > 0 && chalk.cyan(`ip-locked`),
      t.pendingApprovals > 0 && chalk.yellow(`${t.pendingApprovals} pending`),
    ].filter(Boolean).join("  ");

    console.log(`  ${chalk.green("●")} ${chalk.bold(t.url)}`);
    console.log(`    ${chalk.gray("ID")}       ${t.id}`);
    console.log(`    ${chalk.gray("Port")}     ${t.port}`);
    console.log(`    ${chalk.gray("Expires")}  ${formatDate(t.expiresAt)}`);
    if (tags) console.log(`    ${tags}`);
    console.log();
  }
}

/** devnet admin kill-tunnel <id> */
export async function adminKillTunnel(id: string): Promise<void> {
  await adminFetch("POST", "/close-tunnel", { tunnelId: id });
  console.log(chalk.green(`\n  ✓ Tunnel ${id} terminated.\n`));
}

/** devnet admin kill-user <email> */
export async function adminKillUser(email: string): Promise<void> {
  const data = await adminFetch("POST", "/close-user-tunnels", { email }) as { closed: number };
  console.log(chalk.green(`\n  ✓ ${data.closed} tunnel(s) terminated for ${email}.\n`));
}

/** devnet admin logs [--user email] [--event type] [--page n] [--limit n] */
export async function adminLogs(options: {
  user?: string; event?: string; page?: string; limit?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  if (options.user)  params.set("userId",  options.user);   // note: server accepts userId or we can search
  if (options.event) params.set("event",   options.event);
  if (options.page)  params.set("page",    options.page);
  if (options.limit) params.set("limit",   options.limit);

  // If --user is an email, resolve to userId first
  if (options.user && options.user.includes("@")) {
    const list = await adminFetch("GET", "/users") as { users: Array<{ id: string; email: string }> };
    const match = list.users.find((u) => u.email?.toLowerCase() === options.user!.toLowerCase());
    if (!match) { console.error(chalk.red(`\n  No user found: ${options.user}\n`)); process.exit(1); }
    params.set("userId", match.id);
    params.delete("userId"); // remove email-as-id if set
    params.set("userId", match.id);
  }

  const qs = params.toString();
  const data = await adminFetch("GET", `/logs${qs ? `?${qs}` : ""}`) as {
    logs: Array<{ event: string; user_id: string; created_at: string; metadata: Record<string, string>; tunnel_id: string | null }>;
    total: number; page: number; limit: number;
  };

  if (data.logs.length === 0) {
    console.log(chalk.gray("\n  No log entries found.\n"));
    return;
  }

  const totalPages = Math.ceil(data.total / data.limit);
  console.log();
  console.log(chalk.bold(`  Audit Logs`) + chalk.gray(`  (page ${data.page}/${totalPages} · ${data.total} total)`));
  console.log();

  for (const log of data.logs) {
    const meta = Object.entries(log.metadata ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("  ");
    console.log(
      `  ${chalk.gray(formatDate(log.created_at))}  ` +
      `${chalk.cyan(log.event.padEnd(28))}  ` +
      chalk.gray(meta || log.user_id.slice(0, 8) + "…")
    );
  }

  if (data.page < totalPages) {
    console.log(chalk.gray(`\n  More: --page ${data.page + 1}`));
  }
  console.log();
}
