import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";
import type { AgentDecision } from "./types";

const memoryLedger: AgentDecision[] = [];

function ledgerPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_LEDGER_PATH"]) ?? "data/agent-ledger.jsonl");
}

export function appendDecision(decision: AgentDecision): AgentDecision {
  memoryLedger.push(decision);
  memoryLedger.splice(0, Math.max(0, memoryLedger.length - 200));
  try {
    const target = ledgerPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(decision)}\n`);
  } catch {
    // The in-memory ledger is enough for tests and read-only deployments.
  }
  return decision;
}

export function recentDecisions(limit = 25): AgentDecision[] {
  return memoryLedger.slice(-limit).reverse();
}

