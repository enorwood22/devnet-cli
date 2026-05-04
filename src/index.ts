#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loginCommand, logoutCommand } from "./commands/login.js";
import { shareCommand } from "./commands/share.js";
import { lsCommand } from "./commands/ls.js";

const program = new Command();

program
  .name("devnet")
  .description("Secure localhost tunneling with access control")
  .version("0.1.0");

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
  .command("ls")
  .description("List your active tunnels")
  .action(lsCommand);

program.on("command:*", () => {
  console.error(chalk.red(`  Unknown command: ${program.args.join(" ")}\n`));
  program.help();
});

program.parse(process.argv);
