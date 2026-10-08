import { loadAgentConfig } from "./config";
import type { AgentIntent, LlmClient } from "./types";

export class MockLlmClient implements LlmClient {
  async propose(input: Parameters<LlmClient["propose"]>[0]): Promise<AgentIntent> {
    const config = loadAgentConfig();
    if (input.marketAction !== "rotate" || !input.opportunity) {
      return {
        action: input.marketAction === "derisk" ? "derisk" : "hold",
        size_usd: "0",
        max_slippage_pct: config.maxSlippagePct,
        confidence: 0.55,
        rationale: input.marketAction === "derisk" ? "Market close is near; do not open a new rotation." : "No safe cross-issuer rotation passed deterministic filters."
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
}

