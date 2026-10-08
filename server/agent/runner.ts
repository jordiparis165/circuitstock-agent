import crypto from "node:crypto";
import { loadAgentConfig } from "./config";
import { validateIntent } from "./guardrails";
import { appendDecision } from "./ledger";
import { MockLlmClient } from "./llmClient";
import { marketAction } from "./marketState";
import { findRotationOpportunity } from "./strategy";
import type { AgentDecision, AgentSnapshot, LlmClient } from "./types";

export async function runAgentCycle(input: {
  snapshot: AgentSnapshot;
  llm?: LlmClient;
  requestId?: string;
  spentTodayUsd?: string;
  openExposureUsd?: string;
  inFlightPairs?: string[];
  lastTradeAtByPair?: Record<string, number>;
}): Promise<AgentDecision> {
  const config = loadAgentConfig();
  const llm = input.llm ?? new MockLlmClient();
  const action = marketAction(input.snapshot);
  const opportunity = action === "rotate" ? findRotationOpportunity(input.snapshot, config) : undefined;
  const intent = await llm.propose({ snapshot: input.snapshot, opportunity, marketAction: action });
  const violations = validateIntent(intent, {
    snapshot: input.snapshot,
    opportunity,
    spentTodayUsd: input.spentTodayUsd,
    openExposureUsd: input.openExposureUsd,
    inFlightPairs: input.inFlightPairs,
    lastTradeAtByPair: input.lastTradeAtByPair
  }, config);

  const decision: AgentDecision = {
    requestId: input.requestId ?? crypto.randomUUID(),
    at: new Date().toISOString(),
    mode: config.tradingMode,
    action: intent.action,
    outcome: "held",
    intent,
    opportunity,
    violations,
    rationale: intent.rationale
  };

  if (intent.action !== "rotate") {
    decision.outcome = "held";
  } else if (violations.length) {
    decision.outcome = "rejected";
  } else if (config.tradingMode !== "paper") {
    decision.outcome = "blocked-live";
    decision.violations = [...decision.violations, "live execution is intentionally disabled in this branch"];
  } else {
    decision.outcome = "paper-filled";
    decision.paperSimulation = {
      status: "SUCCESS",
      quoteExpiresInSec: 30,
      balanceChanges: [
        { token: intent.from_token?.address ?? "unknown", direction: "out", amountUsd: intent.size_usd },
        { token: intent.to_token?.address ?? "unknown", direction: "in", amountUsd: intent.size_usd }
      ]
    };
  }
  return appendDecision(decision);
}

