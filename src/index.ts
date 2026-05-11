#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loginCommand, logoutCommand } from "./commands/login.js";
import { shareCommand } from "./commands/share.js";
import { activeCommand } from "./commands/active.js";
import { usageCommand } from "./commands/usage.js";
import { updateCommand } from "./commands/update.js";
import {
  adminConfigure,
  adminStats,
  adminUser,
  adminBan,
  adminUnban,
  adminResetBandwidth,
  adminSetPlan,
  adminSendReset,
  adminTunnels,
  adminKillTunnel,
  adminKillUser,
  adminLogs,
} from "./commands/admin.js";
import { CLI_VERSION } from "./version.js";

const program = new Command();

program
  .name("devnet")
  .description("Secure localhost tunneling with access control")
  .version(CLI_VERSION);

program
  .command("login")
  .description("Log in to your DevNet account")
  .action(loginCommand);

program
  .command("logout")
  .description("Log out of your DevNet account")
  .action(logoutCommand);

program
  .command("share <port>")
  .description("Expose a local port to the internet")
  .option("--ttl <duration>", "Tunnel lifetime: 15m, 1h, 24h", "1h")
  .option("--invite <email>", "Email the tunnel URL to someone")
  .option("--password <secret>", "Require a password to access the tunnel")
  .option("--allow-ip <ip...>", "Whitelist specific IPs")
  .option("--open", "Open the tunnel URL in your browser automatically")
  .addHelpText("after", `
Examples:
  devnet share 3000
  devnet share 3000 --ttl 15m
  devnet share 3000 --invite client@example.com
  devnet share 3000 --password hunter2
  devnet share 3000 --allow-ip 1.2.3.4 5.6.7.8
`)
  .action(shareCommand);

program
  .command("active")
  .description("List your active tunnels")
  .action(activeCommand);

program
  .command("usage")
  .description("Show your bandwidth and plan usage")
  .action(usageCommand);

program
  .command("update")
  .description("Update devnet to the latest version")
  .action(updateCommand);

// ── Admin subcommands ─────────────────────────────────────────────────────────

const admin = program
  .command("admin")
  .description("Server administration (requires admin secret)");

admin
  .command("configure")
  .description("Save admin secret and server URL")
  .action(adminConfigure);

admin
  .command("stats")
  .description("Server health snapshot: tunnels, users, bandwidth")
  .action(adminStats);

admin
  .command("user <email>")
  .description("Show full profile for a user")
  .action(adminUser);

admin
  .command("ban <email>")
  .description("Ban a user and terminate their tunnels")
  .action(adminBan);

admin
  .command("unban <email>")
  .description("Lift a ban on a user")
  .action(adminUnban);

admin
  .command("reset-bw <email>")
  .description("Reset bandwidth usage for the current period")
  .action(adminResetBandwidth);

admin
  .command("set-plan <email> <plan>")
  .description("Change a user's plan: free | pro")
  .action(adminSetPlan);

admin
  .command("send-reset <email>")
  .description("Send a password reset email to a user")
  .action(adminSendReset);

admin
  .command("tunnels")
  .description("List all active tunnels")
  .option("--user <email>", "Filter by user email")
  .action(adminTunnels);

admin
  .command("kill-tunnel <id>")
  .description("Force-expire a tunnel by ID")
  .action(adminKillTunnel);

admin
  .command("kill-user <email>")
  .description("Force-expire all tunnels for a user")
  .action(adminKillUser);

admin
  .command("logs")
  .description("View audit logs")
  .option("--user <email>",  "Filter by user email")
  .option("--event <type>",  "Filter by event type (e.g. conn.approved)")
  .option("--page <n>",      "Page number", "1")
  .option("--limit <n>",     "Results per page (max 200)", "50")
  .addHelpText("after", `
Event types:
  tunnel.created  tunnel.expired
  conn.requested  conn.approved  conn.denied  conn.timeout
  conn.ip_blocked  conn.password_fail  conn.password_success
  auth.login  auth.login_failed  auth.logout
  admin.ban  admin.unban  admin.bandwidth_reset  admin.plan_change  admin.password_reset_sent
`)
  .action(adminLogs);

// ── Fallthrough ───────────────────────────────────────────────────────────────

program.on("command:*", () => {
  console.error(chalk.red(`  Unknown command: ${program.args.join(" ")}\n`));
  program.help();
});

program.parse(process.argv);
