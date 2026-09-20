import { pickEnv } from "./env";
import {
  evaluate,
  loadPolicy,
  loadState,
  saveState,
  spentToday,
  today,
  type AutoPolicy,
  type Decision,
  type WatcherState
} from "./policy";

type WatchedOpportunity = {
  symbol: string;
  direction: "buy" | "trim" | "watch";
  spreadBps: number;
  score: number;
  liquidityUsd: number;
};

export type WatcherDeps = {
  fetchOpportunities: () => Promise<WatchedOpportunity[]>;
  prepare: (
    symbol: string,
    side: "buy" | "sell",
    amountUsd: number,
    walletAddress?: string,
    slippageBps?: number
  ) => Promise<{ ok?: boolean; simulationSummary?: { status?: string } | null; error?: string }>;
};

const policy: AutoPolicy = loadPolicy();
const state: WatcherState = loadState();
let timer: NodeJS.Timeout | null = null;
let running = false;
let lastTickAt: string | null = null;

function record(decision: Omit<Decision, "at">): Decision {
  const full = { at: new Date().toISOString(), ...decision };
  state.decisions.push(full);
  console.log(`[watcher] ${full.outcome} ${full.symbol ?? "-"} ${full.reasons.join("; ")}`);
  return full;
}

export async function tick(deps: WatcherDeps): Promise<Decision> {
  if (running) return record({ symbol: null, side: null, amountUsd: 0, outcome: "skipped", reasons: ["previous tick still running"] });
  running = true;
  lastTickAt = new Date().toISOString();
  try {
    const opportunities = await deps.fetchOpportunities();
    const top = opportunities.find((item) => item.direction !== "watch" && Math.abs(item.spreadBps) >= policy.minSpreadBps);
    if (!top) return record({ symbol: null, side: null, amountUsd: 0, outcome: "idle", reasons: ["no spread above threshold"] });

    const side = top.direction === "trim" ? "sell" : "buy";
    const amountUsd = policy.maxTradeUsd;
    const candidate = { symbol: top.symbol, side, amountUsd, spreadBps: top.spreadBps, score: top.score, liquidityUsd: top.liquidityUsd } as const;

    const violations = evaluate(candidate, policy, state);
    if (violations.length) return record({ symbol: top.symbol, side, amountUsd, outcome: "skipped", reasons: violations });

    // Simulation is mandatory: never proceed on anything but SUCCESS.
    const prepared = await deps.prepare(top.symbol, side, amountUsd, policy.walletAddress, policy.maxSlippageBps);
    const simulation = prepared.simulationSummary?.status;
    if (prepared.ok === false || simulation !== "SUCCESS") {
      return record({
        symbol: top.symbol,
        side,
        amountUsd,
        outcome: "skipped",
        reasons: [`simulation not successful (${simulation ?? prepared.error ?? "unavailable"})`]
      });
    }

    state.spentByDay[today()] = spentToday(state) + amountUsd;
    state.lastTradeAt[top.symbol.toUpperCase()] = new Date().toISOString();

    if (policy.mode === "live") {
      // The Agentic Wallet executor is not wired in yet: refuse rather than pretend.
      return record({ symbol: top.symbol, side, amountUsd, outcome: "error", reasons: ["live mode requested but no executor is configured"] });
    }
    return record({ symbol: top.symbol, side, amountUsd, outcome: "would-execute", reasons: ["all policy checks and simulation passed (dry-run, nothing sent)"] });
  } catch (error) {
    return record({ symbol: null, side: null, amountUsd: 0, outcome: "error", reasons: [(error as Error).message] });
  } finally {
    running = false;
    saveState(state);
  }
}

export function startWatcher(deps: WatcherDeps): void {
  if (!policy.enabled) {
    console.log("[watcher] disabled (set AUTO_ENABLED=true to start)");
    return;
  }
  console.log(`[watcher] started in ${policy.mode} mode, every ${policy.intervalSec}s`);
  timer = setInterval(() => void tick(deps), policy.intervalSec * 1000);
  void tick(deps);
}

export function setKilled(killed: boolean): void {
  state.killed = killed;
  saveState(state);
}

export function watcherStatus() {
  return {
    enabled: policy.enabled,
    running: timer !== null,
    killed: state.killed || pickEnv(["AUTO_KILL"]) === "true",
    lastTickAt,
    policy,
    spentTodayUsd: spentToday(state),
    lastTradeAt: state.lastTradeAt,
    decisions: state.decisions.slice(-50).reverse()
  };
}
