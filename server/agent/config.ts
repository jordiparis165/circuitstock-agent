import fs from "node:fs";
import { pickEnv } from "../env";

export type AgentConfig = {
  tradingMode: "paper" | "live";
  maxTradeUsd: string;
  maxDailyUsd: string;
  maxOpenExposureUsd: string;
  maxSlippagePct: string;
  maxPriceImpactPct: string;
  minNetEdgePct: string;
  minLiquidityUsd: string;
  maxPriceAgeSec: number;
  cooldownSec: number;
  deriskBeforeCloseSec: number;
  reentryAfterOpenSec: number;
  ondoMinUsd: string;
  tokenWhitelist: string[];
  killSwitchPath?: string;
};

export function loadAgentConfig(): AgentConfig {
  return {
    tradingMode: pickEnv(["TRADING_MODE"]) === "live" ? "live" : "paper",
    maxTradeUsd: pickEnv(["AGENT_MAX_TRADE_USD"]) ?? "25",
    maxDailyUsd: pickEnv(["AGENT_MAX_DAILY_USD"]) ?? "100",
    maxOpenExposureUsd: pickEnv(["AGENT_MAX_OPEN_EXPOSURE_USD"]) ?? "100",
    maxSlippagePct: pickEnv(["AGENT_MAX_SLIPPAGE_PCT"]) ?? "0.50",
    maxPriceImpactPct: pickEnv(["AGENT_MAX_PRICE_IMPACT_PCT"]) ?? "0.50",
    minNetEdgePct: pickEnv(["AGENT_MIN_NET_EDGE_PCT"]) ?? "0.20",
    minLiquidityUsd: pickEnv(["AGENT_MIN_LIQUIDITY_USD"]) ?? "25000",
    maxPriceAgeSec: Number(pickEnv(["AGENT_MAX_PRICE_AGE_SEC"])) || 120,
    cooldownSec: Number(pickEnv(["AGENT_COOLDOWN_SEC"])) || 900,
    deriskBeforeCloseSec: Number(pickEnv(["AGENT_DERISK_BEFORE_CLOSE_SEC"])) || 900,
    reentryAfterOpenSec: Number(pickEnv(["AGENT_REENTRY_AFTER_OPEN_SEC"])) || 900,
    ondoMinUsd: pickEnv(["AGENT_ONDO_MIN_USD"]) ?? "20",
    tokenWhitelist: (pickEnv(["AGENT_TOKEN_WHITELIST"]) ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    killSwitchPath: pickEnv(["AGENT_KILL_SWITCH_PATH"])
  };
}

export function killSwitchEnabled(config = loadAgentConfig()): boolean {
  if (pickEnv(["AGENT_KILL", "TRADING_KILL_SWITCH"]) === "true") return true;
  if (!config.killSwitchPath) return false;
  try {
    return fs.readFileSync(config.killSwitchPath, "utf8").trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

export function stablecoinFor(platform: string, chain: string): "USDC" | "USDT" {
  if (platform === "ondo" && chain === "56") return "USDT";
  return "USDC";
}

