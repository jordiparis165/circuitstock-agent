import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "./env";

export type AutoMode = "dry-run" | "live";

export type AutoPolicy = {
  enabled: boolean;
  mode: AutoMode;
  intervalSec: number;
  minSpreadBps: number;
  minScore: number;
  minLiquidityUsd: number;
  maxTradeUsd: number;
  maxDailyUsd: number;
  maxSlippageBps: number;
  cooldownSec: number;
  allowedSymbols: string[];
  walletAddress?: string;
};

export type Candidate = {
  symbol: string;
  side: "buy" | "sell";
  amountUsd: number;
  spreadBps: number;
  score: number;
  liquidityUsd: number;
};

export type Decision = {
  at: string;
  symbol: string | null;
  side: "buy" | "sell" | null;
  amountUsd: number;
  outcome: "would-execute" | "executed" | "skipped" | "idle" | "error";
  reasons: string[];
};

export type WatcherState = {
  killed: boolean;
  spentByDay: Record<string, number>;
  lastTradeAt: Record<string, string>;
  decisions: Decision[];
};

const MAX_DECISIONS = 200;
const statePath = path.resolve(process.cwd(), pickEnv(["AUTO_STATE_PATH"]) ?? "data/watcher-state.json");

function num(key: string, fallback: number): number {
  const value = Number(pickEnv([key]));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadPolicy(): AutoPolicy {
  return {
    enabled: pickEnv(["AUTO_ENABLED"]) === "true",
    // Only dry-run exists until the Agentic Wallet executor is wired in.
    mode: pickEnv(["AUTO_MODE"]) === "live" ? "live" : "dry-run",
    intervalSec: Math.max(15, num("AUTO_INTERVAL_SEC", 60)),
    minSpreadBps: num("AUTO_MIN_SPREAD_BPS", 50),
    minScore: num("AUTO_MIN_SCORE", 35),
    minLiquidityUsd: num("AUTO_MIN_LIQUIDITY_USD", 100_000),
    maxTradeUsd: num("AUTO_MAX_TRADE_USD", 25),
    maxDailyUsd: num("AUTO_MAX_DAILY_USD", 100),
    maxSlippageBps: num("AUTO_MAX_SLIPPAGE_BPS", 50),
    cooldownSec: num("AUTO_COOLDOWN_SEC", 900),
    // Empty whitelist means nothing is allowed.
    allowedSymbols: (pickEnv(["AUTO_ALLOWED_SYMBOLS"]) ?? "")
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
    walletAddress: pickEnv(["AUTO_WALLET_ADDRESS"])
  };
}

export function loadState(): WatcherState {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<WatcherState>;
    return {
      killed: Boolean(parsed.killed),
      spentByDay: parsed.spentByDay ?? {},
      lastTradeAt: parsed.lastTradeAt ?? {},
      decisions: parsed.decisions ?? []
    };
  } catch {
    return { killed: false, spentByDay: {}, lastTradeAt: {}, decisions: [] };
  }
}

export function saveState(state: WatcherState): void {
  state.decisions = state.decisions.slice(-MAX_DECISIONS);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function spentToday(state: WatcherState, now = new Date()): number {
  return state.spentByDay[today(now)] ?? 0;
}

/** Returns the list of violated rules; an empty list means the trade is allowed. */
export function evaluate(candidate: Candidate, policy: AutoPolicy, state: WatcherState, now = new Date()): string[] {
  const violations: string[] = [];
  const symbol = candidate.symbol.toUpperCase();

  if (state.killed || pickEnv(["AUTO_KILL"]) === "true") violations.push("kill switch is on");
  if (!policy.allowedSymbols.includes(symbol)) violations.push(`${symbol} is not in AUTO_ALLOWED_SYMBOLS`);
  if (Math.abs(candidate.spreadBps) < policy.minSpreadBps) {
    violations.push(`spread ${Math.abs(candidate.spreadBps)} bps < min ${policy.minSpreadBps}`);
  }
  if (candidate.score < policy.minScore) violations.push(`score ${candidate.score} < min ${policy.minScore}`);
  if (candidate.liquidityUsd < policy.minLiquidityUsd) {
    violations.push(`liquidity $${Math.round(candidate.liquidityUsd)} < min $${policy.minLiquidityUsd}`);
  }
  if (candidate.amountUsd > policy.maxTradeUsd) {
    violations.push(`amount $${candidate.amountUsd} > max trade $${policy.maxTradeUsd}`);
  }
  const spent = spentToday(state, now);
  if (spent + candidate.amountUsd > policy.maxDailyUsd) {
    violations.push(`daily budget exceeded ($${spent} spent + $${candidate.amountUsd} > $${policy.maxDailyUsd})`);
  }
  const last = state.lastTradeAt[symbol];
  if (last && now.getTime() - new Date(last).getTime() < policy.cooldownSec * 1000) {
    violations.push(`cooldown active for ${symbol}`);
  }
  if (!policy.walletAddress) violations.push("AUTO_WALLET_ADDRESS is not set");
  return violations;
}
