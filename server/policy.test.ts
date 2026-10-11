import assert from "node:assert/strict";
import test from "node:test";
import { evaluate, type AutoPolicy, type Candidate, type WatcherState } from "./policy";

const basePolicy: AutoPolicy = {
  enabled: true,
  mode: "dry-run",
  intervalSec: 60,
  minSpreadBps: 25,
  minScore: 35,
  minLiquidityUsd: 100_000,
  maxTradeUsd: 25,
  maxDailyUsd: 100,
  maxSlippageBps: 50,
  cooldownSec: 900,
  allowedSymbols: ["IBMB"],
  walletAddress: "0x000000000000000000000000000000000000dEaD",
  maxRoundTripCostPct: 1
};

const baseCandidate: Candidate = {
  symbol: "IBMB",
  side: "sell",
  amountUsd: 10,
  spreadBps: 50,
  score: 90,
  liquidityUsd: 1_000_000,
  roundTripCostPct: 0.1
};

function state(overrides: Partial<WatcherState> = {}): WatcherState {
  return { killed: false, spentByDay: {}, lastTradeAt: {}, decisions: [], ...overrides };
}

test("allows a whitelisted candidate inside policy limits", () => {
  assert.deepEqual(evaluate(baseCandidate, basePolicy, state(), new Date("2026-09-22T12:00:00Z")), []);
});

test("blocks symbols outside the explicit whitelist", () => {
  const violations = evaluate({ ...baseCandidate, symbol: "TSLAB" }, basePolicy, state());
  assert.equal(violations.some((item) => item.includes("not in AUTO_ALLOWED_SYMBOLS")), true);
});

test("blocks when daily budget would be exceeded", () => {
  const violations = evaluate(
    { ...baseCandidate, amountUsd: 25 },
    basePolicy,
    state({ spentByDay: { "2026-09-22": 90 } }),
    new Date("2026-09-22T12:00:00Z")
  );
  assert.equal(violations.some((item) => item.includes("daily budget exceeded")), true);
});

test("blocks while cooldown is active", () => {
  const violations = evaluate(
    baseCandidate,
    basePolicy,
    state({ lastTradeAt: { IBMB: "2026-09-22T11:55:00.000Z" } }),
    new Date("2026-09-22T12:00:00Z")
  );
  assert.equal(violations.some((item) => item.includes("cooldown active")), true);
});

test("blocks a route whose measured round-trip cost exceeds the policy max", () => {
  const violations = evaluate({ ...baseCandidate, roundTripCostPct: 11.227 }, basePolicy, state());
  assert.equal(violations.some((item) => item.includes("measured round-trip cost 11.227% > max 1%")), true);
});

test("allows a route right at the threshold, blocks just over it", () => {
  assert.equal(evaluate({ ...baseCandidate, roundTripCostPct: 1 }, basePolicy, state()).length, 0);
  const violations = evaluate({ ...baseCandidate, roundTripCostPct: 1.001 }, basePolicy, state());
  assert.equal(violations.some((item) => item.includes("round-trip cost")), true);
});

test("fails closed when round-trip cost was never measured (undefined is not a pass)", () => {
  const { roundTripCostPct: _omit, ...candidateWithoutCost } = baseCandidate;
  const violations = evaluate(candidateWithoutCost as Candidate, basePolicy, state());
  assert.equal(violations.some((item) => item.includes("round-trip cost not measured")), true);
});
