import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";
import type { AgentDecision } from "./types";

const memoryLedger: AgentDecision[] = [];

function ledgerPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_LEDGER_PATH"]) ?? "data/agent-ledger.jsonl");
}

export function appendDecision(decision: AgentDecision): AgentDecision {
  const existing = findDecisionByRequestId(decision.requestId);
  if (existing) return existing;
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
  const persisted = readPersistedDecisions();
  const byId = new Map<string, AgentDecision>();
  for (const decision of [...persisted, ...memoryLedger]) byId.set(decision.requestId, decision);
  return [...byId.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-limit)
    .reverse();
}

export function findDecisionByRequestId(requestId?: string): AgentDecision | undefined {
  if (!requestId) return undefined;
  return [...memoryLedger, ...readPersistedDecisions()].find((decision) => decision.requestId === requestId);
}

function readPersistedDecisions(): AgentDecision[] {
  try {
    return fs
      .readFileSync(ledgerPath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AgentDecision);
  } catch {
    return [];
  }
}
