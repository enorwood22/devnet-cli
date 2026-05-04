import readline from "readline";
import chalk from "chalk";
import { login, logout, isLoggedIn, checkHealth } from "../lib/auth.js";
import config from "../lib/config.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function promptPassword(question: string): Promise<string> {
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
      } else if (ch === "\x03") {
        process.stdout.write("\n");
        process.exit(0);
      } else if (ch === "\x7f" || ch === "\x08") {
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

  process.stdout.write("  Connecting to relay server...");
  try {
    await checkHealth();
    process.stdout.write(chalk.gray(" ok\n"));
  } catch (err: unknown) {
    process.stdout.write("\n");
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let email: string;
  let pass: string;
  try {
    email = await prompt(rl, "  Email: ");
    rl.close();
    pass = await promptPassword("  Password: ");
  } catch {
    rl.close();
    process.exit(1);
  }

  process.stdout.write("  Logging in...");
  try {
    await login(email!, pass!);
    process.stdout.write("\n");
    console.log(chalk.green(`  Logged in as ${email}`));
  } catch (err: unknown) {
    process.stdout.write("\n");
    console.error(chalk.red(`  Login failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

export async function logoutCommand(): Promise<void> {
  await logout();
  console.log(chalk.green("  Logged out."));
}
