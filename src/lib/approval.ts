import readline from "readline";
import chalk from "chalk";
import type { WsMessage } from "../types.js";

type ConnRequest = Extract<WsMessage, { type: "conn:request" }>;

export async function promptApproval(req: ConnRequest): Promise<boolean> {
  console.log(chalk.yellow("\n  Incoming connection request:"));
  console.log(`  Device:     ${chalk.bold(req.device)}`);
  console.log(`  IP:         ${req.ip}`);
  console.log(`  Path:       ${req.path}`);
  console.log();

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("  Allow this connection? [y/N] ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
