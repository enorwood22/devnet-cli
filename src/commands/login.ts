import { password as promptPassword, input } from "@inquirer/prompts";
import chalk from "chalk";
import ora from "ora";
import { login, logout, isLoggedIn, checkHealth } from "../lib/auth.js";
import config from "../lib/config.js";

export async function loginCommand(): Promise<void> {
  if (isLoggedIn()) {
    console.log(chalk.green(`  Already logged in as ${config.get("email")}`));
    return;
  }

  const healthSpinner = ora("Connecting to relay server...").start();
  try {
    await checkHealth();
    healthSpinner.succeed(chalk.gray("Relay server reachable"));
  } catch (err: unknown) {
    healthSpinner.fail(chalk.red((err as Error).message));
    process.exit(1);
  }

  const email = await input({ message: "Email:" });
  const pass = await promptPassword({ message: "Password:" });

  const spinner = ora("Logging in...").start();
  try {
    await login(email, pass);
    spinner.succeed(chalk.green(`Logged in as ${email}`));
  } catch (err: unknown) {
    spinner.fail(chalk.red(`Login failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

export async function logoutCommand(): Promise<void> {
  await logout();
  console.log(chalk.green("  Logged out."));
}
