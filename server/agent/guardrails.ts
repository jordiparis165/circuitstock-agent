import { loadAgentConfig, killSwitchEnabled, stablecoinFor, type AgentConfig } from "./config";
import { addDecimal, compareDecimal, gteDecimal, lteDecimal } from "./decimal";
import type { AgentIntent, AgentOpportunity, AgentSnapshot, SnapshotToken } from "./types";

export type GuardrailContext = {
  snapshot: AgentSnapshot;
  opportunity?: AgentOpportunity;
  spentTodayUsd?: string;
  openExposureUsd?: string;
  inFlightPairs?: string[];
  lastTradeAtByPair?: Record<string, number>;
  nowSec?: number;
};

function findToken(snapshot: AgentSnapshot, address?: string): SnapshotToken | undefined {
  if (!address) return undefined;
  const normalized = address.toLowerCase();
  for (const pair of snapshot.pairs) {
    for (const token of [pair.a, pair.b]) {
      if (token.address.toLowerCase() === normalized) return token;
    }
  }
  return undefined;
}

function whitelistAllows(token: SnapshotToken, config: AgentConfig): boolean {
  if (config.tokenWhitelist.length === 0) return true;
  return config.tokenWhitelist.includes(token.address.toLowerCase());
}

export function validateIntent(intent: AgentIntent, context: GuardrailContext, config: AgentConfig = loadAgentConfig()): string[] {
  const violations: string[] = [];
  if (killSwitchEnabled(config)) violations.push("agent kill switch is on");
  if (config.tradingMode !== "paper") violations.push("live mode is not wired; paper mode is required");

  if (intent.action !== "rotate") {
    if (context.snapshot.market.open && intent.action === "hold") return violations;
    return violations;
  }

  const from = findToken(context.snapshot, intent.from_token?.address);
  const to = findToken(context.snapshot, intent.to_token?.address);
  if (!from || !to) {
    violations.push("intent token address is not present in snapshot");
    return violations;
  }

  if (!intent.from_token || !intent.to_token || intent.from_token.chain !== intent.to_token.chain) {
    violations.push("from_token and to_token must be present on the same chain");
  }
  if (!context.snapshot.market.open) violations.push("market is closed");
  if (from.price_age_s > config.maxPriceAgeSec || to.price_age_s > config.maxPriceAgeSec) violations.push("price data is stale");
  if (!whitelistAllows(from, config) || !whitelistAllows(to, config)) violations.push("token is not whitelisted");
  if (from.isHoneyPot || to.isHoneyPot) violations.push("honeypot flag present");
  if (compareDecimal(from.taxRate ?? "0", "0.01") > 0 || compareDecimal(to.taxRate ?? "0", "0.01") > 0) violations.push("token tax rate too high");
  if (!gteDecimal(from.liquidity_usd, config.minLiquidityUsd) || !gteDecimal(to.liquidity_usd, config.minLiquidityUsd)) {
    violations.push("pool liquidity below minimum");
  }
  if (!lteDecimal(intent.size_usd, config.maxTradeUsd)) violations.push("trade size exceeds maxTradeUsd");
  if (!lteDecimal(intent.max_slippage_pct, config.maxSlippagePct)) violations.push("slippage exceeds maxSlippagePct");
  if (context.spentTodayUsd && !lteDecimal(addDecimal(context.spentTodayUsd, intent.size_usd), config.maxDailyUsd)) {
    violations.push("daily notional cap exceeded");
  }
  if (context.openExposureUsd && !lteDecimal(addDecimal(context.openExposureUsd, intent.size_usd), config.maxOpenExposureUsd)) {
    violations.push("open exposure cap exceeded");
  }
  if (context.opportunity && !gteDecimal(context.opportunity.netEdgePct, config.minNetEdgePct)) violations.push("net edge below minimum");
  if (to.platform === "ondo" && compareDecimal(intent.size_usd, config.ondoMinUsd) < 0) violations.push("Ondo minimum size is not met");

  const pairKey = context.opportunity?.pairKey;
  if (pairKey && context.inFlightPairs?.includes(pairKey)) violations.push("order already in flight for pair");
  if (pairKey && context.lastTradeAtByPair?.[pairKey]) {
    const nowSec = context.nowSec ?? Math.floor(Date.now() / 1000);
    if (nowSec - context.lastTradeAtByPair[pairKey] < config.cooldownSec) violations.push("cooldown active for pair");
  }

  const stablecoin = stablecoinFor(to.platform, intent.to_token?.chain ?? "");
  if (to.platform === "ondo" && stablecoin !== "USDT") violations.push("Ondo on BSC must route through USDT");
  return violations;
}
