import { compareDecimal } from "./decimal";
import type { AgentExecutionPreview, AgentExecutor, AgentIntent, AgentOpportunity } from "./types";

export class PaperExecutor implements AgentExecutor {
  async quoteAndSimulate(input: { intent: AgentIntent; opportunity: AgentOpportunity; requestId: string }): Promise<AgentExecutionPreview> {
    return {
      quoteId: `paper-${input.requestId}`,
      quoteExpiresInSec: 30,
      route: `${input.opportunity.from.platform}->${input.opportunity.to.platform}`,
      priceImpactPct: "0",
      gasUsd: "0",
      balanceChanges: [
        { token: input.intent.from_token?.address ?? "unknown", direction: "out", amountUsd: input.intent.size_usd },
        { token: input.intent.to_token?.address ?? "unknown", direction: "in", amountUsd: input.intent.size_usd }
      ]
    };
  }
}

function hasBalanceChange(
  preview: AgentExecutionPreview,
  token: string | undefined,
  direction: "in" | "out",
  amountUsd: string
): boolean {
  if (!token) return false;
  return preview.balanceChanges.some(
    (change) =>
      change.token.toLowerCase() === token.toLowerCase() &&
      change.direction === direction &&
      compareDecimal(change.amountUsd, amountUsd) === 0
  );
}

export function compareSimulationToIntent(intent: AgentIntent, preview: AgentExecutionPreview): string[] {
  const mismatches: string[] = [];
  if (!hasBalanceChange(preview, intent.from_token?.address, "out", intent.size_usd)) {
    mismatches.push("simulation does not spend the expected from_token amount");
  }
  if (!hasBalanceChange(preview, intent.to_token?.address, "in", intent.size_usd)) {
    mismatches.push("simulation does not receive the expected to_token amount");
  }
  if (compareDecimal(preview.priceImpactPct, intent.max_slippage_pct) > 0) {
    mismatches.push("simulation price impact exceeds requested slippage cap");
  }
  return mismatches;
}

