import { loadAgentConfig, type AgentConfig } from "./config";
import { formatDecimal, gteDecimal, minDecimal, minusPct, percentDiff } from "./decimal";
import type { AgentOpportunity, AgentSnapshot, SnapshotToken } from "./types";

function keyFor(ticker: string, chain: string): string {
  return `${chain}:${ticker.toUpperCase()}`;
}

function isCrossIssuer(a: SnapshotToken, b: SnapshotToken): boolean {
  return a.platform !== b.platform && new Set([a.platform, b.platform]).size === 2;
}

export function findRotationOpportunity(snapshot: AgentSnapshot, config: AgentConfig = loadAgentConfig()): AgentOpportunity | undefined {
  let best: AgentOpportunity | undefined;
  for (const pair of snapshot.pairs) {
    if (pair.chain !== "56") continue;
    if (!isCrossIssuer(pair.a, pair.b)) continue;
    if (pair.a.price_age_s > config.maxPriceAgeSec || pair.b.price_age_s > config.maxPriceAgeSec) continue;
    if (!gteDecimal(pair.a.liquidity_usd, config.minLiquidityUsd) || !gteDecimal(pair.b.liquidity_usd, config.minLiquidityUsd)) continue;

    const aIsMoreExpensive = gteDecimal(pair.a.price_per_share, pair.b.price_per_share);
    const from = aIsMoreExpensive ? pair.a : pair.b;
    const to = aIsMoreExpensive ? pair.b : pair.a;
    const grossSpreadPct = formatDecimal(percentDiff(from.price_per_share, to.price_per_share), 4);
    const netEdgePct = minusPct(grossSpreadPct, config.maxSlippagePct);
    if (!gteDecimal(netEdgePct, config.minNetEdgePct)) continue;

    const sizeUsd = minDecimal(config.maxTradeUsd, from.liquidity_usd);
    const opportunity: AgentOpportunity = {
      ticker: pair.ticker,
      pairKey: keyFor(pair.ticker, pair.chain),
      chain: pair.chain,
      from,
      to,
      sizeUsd,
      grossSpreadPct,
      netEdgePct,
      reason: `${from.platform} is executable above ${to.platform} by ${grossSpreadPct}% gross; estimated net edge ${netEdgePct}%.`
    };
    if (!best || gteDecimal(opportunity.netEdgePct, best.netEdgePct)) best = opportunity;
  }
  return best;
}

