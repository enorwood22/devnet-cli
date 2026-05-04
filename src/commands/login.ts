import readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { login, logout, isLoggedIn, checkHealth } from "../lib/auth.js";
import config from "../lib/config.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function promptPassword(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    const onData = (ch: string) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(password);
      } else if (ch === "") {
        process.stdout.write("\n");
        process.exit(0);
      } else if (ch === "") {
        password = password.slice(0, -1);
      } else {
        password += ch;
      }
    };
    stdin.on("data", onData);
  });
}

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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let email: string;
  let pass: string;
  try {
    email = await prompt(rl, "  Email: ");
    rl.close();
    pass = await promptPassword(rl, "  Password: ");
  } catch {
    rl.close();
    process.exit(1);
  }

  const spinner = ora("Logging in...").start();
  try {
    await login(email!, pass!);
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
