import assert from "node:assert/strict";
import test from "node:test";
import { computeBackoffMs, crossCheck, selectReading, type ReferenceReading } from "./referencePrice";

function reading(overrides: Partial<ReferenceReading> = {}): ReferenceReading {
  return { price: 100, ts: 1_000_000, source: "alpaca", ...overrides };
}

test("selectReading: fallback switch - picks Finnhub when Alpaca has nothing", () => {
  const finnhub = reading({ source: "finnhub", ts: 500 });
  assert.deepEqual(selectReading([null, finnhub]), finnhub);
});

test("selectReading: picks the freshest of two usable readings", () => {
  const older = reading({ ts: 1000, price: 101 });
  const newer = reading({ source: "finnhub", ts: 2000, price: 99 });
  assert.deepEqual(selectReading([older, newer]), newer);
});

test("selectReading: ticker absent - no usable reading returns null", () => {
  assert.equal(selectReading([null, undefined]), null);
  assert.equal(selectReading([{ price: 0, ts: 1, source: "alpaca" }, { price: NaN, ts: 2, source: "finnhub" }]), null);
});

test("crossCheck: flags a disagreement beyond the sanity bound", () => {
  const a = reading({ source: "alpaca", price: 100 });
  const b = reading({ source: "finnhub", price: 110 });
  const warning = crossCheck(a, b, 2);
  assert.match(warning ?? "", /disagree/);
});

test("crossCheck: stays quiet within the sanity bound, or when one side is missing", () => {
  const a = reading({ source: "alpaca", price: 100 });
  const b = reading({ source: "finnhub", price: 100.5 });
  assert.equal(crossCheck(a, b, 2), undefined);
  assert.equal(crossCheck(a, null), undefined);
  assert.equal(crossCheck(null, b), undefined);
});

test("computeBackoffMs: grows with attempt number and respects the cap (429 handling)", () => {
  const first = computeBackoffMs(1, 500, 15000);
  const second = computeBackoffMs(2, 500, 15000);
  const capped = computeBackoffMs(10, 500, 15000);
  assert.ok(first >= 250 && first <= 500, `attempt 1 should be within [250,500], got ${first}`);
  assert.ok(second >= 500 && second <= 1000, `attempt 2 should be within [500,1000], got ${second}`);
  assert.ok(capped <= 15000, `attempt 10 should respect the cap, got ${capped}`);
});
