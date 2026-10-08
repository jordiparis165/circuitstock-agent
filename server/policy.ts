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
  // TEMPORARY: one-time cumulative spend cap for the build/test phase only (set via
  // AUTO_TEST_LIFETIME_USD). Remove this field, its env var, and the evaluate() check below
  // before final delivery - it is not meant to be a permanent product limit and is intentionally
  // kept off the Agent Studio page so end users never see it as a "real" setting.
  testLifetimeCapUsd?: number;
};

// Fields the end user can tune for their own risk/budget from the UI (Agent Studio). Everything
// else (enabled, mode, intervalSec, walletAddress, testLifetimeCapUsd) stays operator/env-only.
export type EditablePolicy = Pick<
  AutoPolicy,
  "minSpreadBps" | "minScore" | "minLiquidityUsd" | "maxTradeUsd" | "maxDailyUsd" | "maxSlippageBps" | "cooldownSec" | "allowedSymbols"
>;

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
const overridesPath = path.resolve(process.cwd(), pickEnv(["AUTO_POLICY_OVERRIDES_PATH"]) ?? "data/watcher-policy-overrides.json");

function num(key: string, fallback: number): number {
  const value = Number(pickEnv([key]));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function numOptional(key: string): number | undefined {
  const value = Number(pickEnv([key]));
  return Number.isFinite(value) && value > 0 ? value : undefined;
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
    cooldownSec: num("AUTO_COOLDOWN_SEC", 7200),
    // Empty whitelist means nothing is allowed.
    allowedSymbols: (pickEnv(["AUTO_ALLOWED_SYMBOLS"]) ?? "")
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
    walletAddress: pickEnv(["AUTO_WALLET_ADDRESS"]),
    // TEMPORARY - see the field's doc comment on AutoPolicy.
    testLifetimeCapUsd: numOptional("AUTO_TEST_LIFETIME_USD")
  };
}

function loadOverrides(): Partial<EditablePolicy> {
  try {
    return JSON.parse(fs.readFileSync(overridesPath, "utf8")) as Partial<EditablePolicy>;
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Partial<EditablePolicy>): void {
  fs.mkdirSync(path.dirname(overridesPath), { recursive: true });
  fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2));
}

let currentPolicy: AutoPolicy = { ...loadPolicy(), ...loadOverrides() };

/** The live policy, including any user-saved overrides. Watcher ticks must read this, not loadPolicy(), so edits apply immediately. */
export function getPolicy(): AutoPolicy {
  return currentPolicy;
}

function clampNumber(value: number, min: number): number {
  return Number.isFinite(value) && value >= min ? value : min;
}

/** Applies and persists a partial set of user-editable fields; unrecognized/invalid values are ignored. */
export function updatePolicy(partial: Partial<EditablePolicy>): AutoPolicy {
  const next: Partial<EditablePolicy> = {};
  if (partial.minSpreadBps !== undefined) next.minSpreadBps = clampNumber(Number(partial.minSpreadBps), 0);
  if (partial.minScore !== undefined) next.minScore = clampNumber(Number(partial.minScore), 0);
  if (partial.minLiquidityUsd !== undefined) next.minLiquidityUsd = clampNumber(Number(partial.minLiquidityUsd), 0);
  if (partial.maxTradeUsd !== undefined) next.maxTradeUsd = clampNumber(Number(partial.maxTradeUsd), 1);
  if (partial.maxDailyUsd !== undefined) next.maxDailyUsd = clampNumber(Number(partial.maxDailyUsd), 1);
  if (partial.maxSlippageBps !== undefined) next.maxSlippageBps = clampNumber(Number(partial.maxSlippageBps), 1);
  if (partial.cooldownSec !== undefined) next.cooldownSec = clampNumber(Number(partial.cooldownSec), 0);
  if (partial.allowedSymbols !== undefined) {
    next.allowedSymbols = partial.allowedSymbols.map((symbol) => String(symbol).trim().toUpperCase()).filter(Boolean);
  }

  currentPolicy = { ...currentPolicy, ...next };
  saveOverrides({ ...loadOverrides(), ...next });
  return currentPolicy;
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

/** TEMPORARY - cumulative spend across every day, used only for the build/test lifetime cap. */
export function spentLifetime(state: WatcherState): number {
  return Object.values(state.spentByDay).reduce((sum, value) => sum + value, 0);
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
  // TEMPORARY - build/test phase only, see AutoPolicy.testLifetimeCapUsd. Remove before delivery.
  if (policy.testLifetimeCapUsd !== undefined) {
    const lifetimeSpent = spentLifetime(state);
    if (lifetimeSpent + candidate.amountUsd > policy.testLifetimeCapUsd) {
      violations.push(
        `TEST budget cap reached ($${lifetimeSpent} spent + $${candidate.amountUsd} > $${policy.testLifetimeCapUsd} lifetime test cap - temporary, removed before delivery)`
      );
    }
  }
  const last = state.lastTradeAt[symbol];
  if (last && now.getTime() - new Date(last).getTime() < policy.cooldownSec * 1000) {
    violations.push(`cooldown active for ${symbol}`);
  }
  if (!policy.walletAddress) violations.push("AUTO_WALLET_ADDRESS is not set");
  return violations;
}
