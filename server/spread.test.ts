import assert from "node:assert/strict";
import test from "node:test";
import { classifyDirection, computeSpread, isOutlier, isStale, isTradeable, normalizePerSharePrice, parseCandleCloses } from "./spread";

test("spread sign & magnitude with known inputs", () => {
  // on-chain cheaper than reference -> negative spread -> buy
  const cheap = computeSpread(99, 100);
  assert.equal(cheap?.spreadPct, -1);
  assert.equal(cheap?.spreadBps, -100);
  assert.equal(cheap?.direction, "buy");

  // on-chain richer -> positive spread -> trim
  const rich = computeSpread(102, 100);
  assert.equal(rich?.spreadPct, 2);
  assert.equal(rich?.spreadBps, 200);
  assert.equal(rich?.direction, "trim");

  // equal prices -> 0 spread -> watch
  const flat = computeSpread(100, 100);
  assert.equal(flat?.spreadBps, 0);
  assert.equal(flat?.direction, "watch");
});

test("classifyDirection treats small noise as watch regardless of sign", () => {
  assert.equal(classifyDirection(4), "watch");
  assert.equal(classifyDirection(-4), "watch");
  assert.equal(classifyDirection(5), "trim");
  assert.equal(classifyDirection(-5), "buy");
});

test("share ratio normalization (decimals/ratio conversion)", () => {
  // Real example: NFLXon tokenPrice 6757.0588, ratio 10 -> matches referencePrice 675.70588.
  assert.equal(normalizePerSharePrice("6757.0588", "10"), 675.70588);
  // ratio ~1 (bstock tokens) should pass through almost unchanged.
  assert.equal(normalizePerSharePrice(100, 1), 100);
  assert.equal(normalizePerSharePrice("50.5", "1.006601"), 50.5 / 1.006601);
});

test("null / zero price handling - never coerced to 0", () => {
  assert.equal(computeSpread(0, 100), null);
  assert.equal(computeSpread(100, 0), null);
  assert.equal(computeSpread(null, 100), null);
  assert.equal(computeSpread(100, undefined), null);
  assert.equal(computeSpread("not-a-number", 100), null);

  assert.equal(normalizePerSharePrice(0, 1), null);
  assert.equal(normalizePerSharePrice(100, 0), null);
  assert.equal(normalizePerSharePrice(null, 1), null);
  assert.equal(normalizePerSharePrice(100, null), null);
});

test("stale timestamp rejection", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  assert.equal(isStale(now, now - 5000, 10000), false); // 5s old, 10s budget -> fresh
  assert.equal(isStale(now, now - 15000, 10000), true); // 15s old, 10s budget -> stale
  assert.equal(isStale(now, null, 10000), true); // missing timestamp -> treated as stale
  assert.equal(isStale(now, undefined, 10000), true);
  assert.equal(isStale(now, NaN, 10000), true);
});

test("market-closed gating - unknown state fails safe (treated as closed)", () => {
  assert.equal(isTradeable(true), true);
  assert.equal(isTradeable(false), false);
  assert.equal(isTradeable(null), false);
  assert.equal(isTradeable(undefined), false);
});

test("candle row parsing - real documented array shape, not an object with a close key", () => {
  // Real response shape captured live from MVLLB during the audit (findNumbersDeep used to return
  // 0 points for this exact payload because it only looked for {close|c|price} keys).
  const rows = [
    [34.82157872105192, 34.93126463582136, 34.82157872105192, 34.93126463582136, 1220.13, 1790691420000, 1],
    [34.93126463582136, 35.17303319939187, 34.93126463582136, 35.17303319939187, 35.4, 1790696460000, 1],
    ["35.17", "35.84", "35.17", "35.84062326191937", "100", 1790700000000, 2] // defensive: numeric strings too
  ];
  assert.deepEqual(parseCandleCloses(rows), [34.93126463582136, 35.17303319939187, 35.84062326191937]);
});

test("candle row parsing - malformed/empty input never throws", () => {
  assert.deepEqual(parseCandleCloses(null), []);
  assert.deepEqual(parseCandleCloses(undefined), []);
  assert.deepEqual(parseCandleCloses([{ close: 50 }]), []); // object rows are not the real shape - ignored, not misread
  assert.deepEqual(parseCandleCloses([[1, 2]]), []); // row too short
});

test("outlier filter", () => {
  assert.equal(isOutlier(5), false);
  assert.equal(isOutlier(-19.9), false);
  assert.equal(isOutlier(20.1), true);
  assert.equal(isOutlier(-25), true);
  assert.equal(isOutlier(30, 50), false); // custom bound
});
