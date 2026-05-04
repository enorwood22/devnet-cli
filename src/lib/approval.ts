import { select } from "@inquirer/prompts";
import chalk from "chalk";
import type { WsMessage } from "../types.js";

type ConnRequest = Extract<WsMessage, { type: "conn:request" }>;

export async function promptApproval(req: ConnRequest): Promise<boolean> {
  console.log(chalk.yellow("\n  Incoming connection request:"));
  console.log(`  Device:     ${chalk.bold(req.device)}`);
  console.log(`  IP:         ${req.ip}`);
  console.log(`  Path:       ${req.path}`);
  console.log();

  const answer = await select({
    message: "Allow this connection?",
    choices: [
      { name: "Approve", value: "approve" },
      { name: "Deny", value: "deny" },
    ],
  });

  return answer === "approve";
}
