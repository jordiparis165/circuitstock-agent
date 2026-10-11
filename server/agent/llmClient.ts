import { loadAgentConfig } from "./config";
import { llmStatus, proposeIntentWithLlm } from "./llm";
import type { AgentIntent, LlmClient } from "./types";

/**
 * Deterministic baseline used when no model is configured or the model call fails.
 *
 * This is not a stand-in that pretends to be an LLM: it is the policy the code would follow on
 * its own, and the agent is still correct when it runs. The UI reports which of the two produced
 * a decision, so a reader is never misled about whether a model was involved.
 */
export class DeterministicLlmClient implements LlmClient {
  async propose(input: Parameters<LlmClient["propose"]>[0]): Promise<AgentIntent> {
    return deterministicIntent(input);
  }
}

function deterministicIntent(input: Parameters<LlmClient["propose"]>[0]): AgentIntent {
  const config = loadAgentConfig();
  if (input.marketAction !== "rotate" || !input.opportunity) {
    return {
      action: input.marketAction === "derisk" ? "derisk" : "hold",
      size_usd: "0",
      max_slippage_pct: config.maxSlippagePct,
      confidence: 0.55,
      rationale:
        input.marketAction === "derisk"
          ? "Market close is near; do not open a new rotation."
          : "No safe cross-issuer rotation passed deterministic filters."
    };
  }
  return {
    action: "rotate",
    from_token: {
      chain: input.opportunity.chain,
      address: input.opportunity.from.address,
      platform: input.opportunity.from.platform
    },
    to_token: {
      chain: input.opportunity.chain,
      address: input.opportunity.to.address,
      platform: input.opportunity.to.platform
    },
    size_usd: input.opportunity.sizeUsd,
    max_slippage_pct: config.maxSlippagePct,
    confidence: 0.78,
    rationale: input.opportunity.reason
  };
}

/**
 * Real model in the "LLM proposes, deterministic code disposes" loop (see CLAUDE.md).
 *
 * The model may only choose the action, a confidence and a rationale. Token addresses, trade
 * size and slippage are overwritten with the values the strategy computed, so a hallucinated or
 * manipulated figure cannot reach the executor even before `validateIntent` runs.
 */
export class OpenAiLlmClient implements LlmClient {
  async propose(input: Parameters<LlmClient["propose"]>[0]): Promise<AgentIntent> {
    const baseline = deterministicIntent(input);
    const proposal = await proposeIntentWithLlm({
      marketAction: input.marketAction,
      opportunity: input.opportunity
        ? {
            ticker: input.opportunity.ticker,
            grossSpreadPct: input.opportunity.grossSpreadPct,
            netEdgePct: input.opportunity.netEdgePct,
            sizeUsd: input.opportunity.sizeUsd,
            fromPlatform: input.opportunity.from.platform,
            toPlatform: input.opportunity.to.platform
          }
        : undefined
    });
    if (!proposal) return baseline;

    // Only these three fields are the model's to decide.
    return {
      ...baseline,
      action: proposal.action,
      confidence: proposal.confidence,
      rationale: proposal.rationale,
      // A non-rotate call must not carry a trade size or token pair.
      ...(proposal.action === "rotate" ? {} : { size_usd: "0", from_token: undefined, to_token: undefined })
    };
  }
}

/** Picks the real model when a key is configured, the deterministic baseline otherwise. */
export function defaultLlmClient(): LlmClient {
  return llmStatus().configured ? new OpenAiLlmClient() : new DeterministicLlmClient();
}
