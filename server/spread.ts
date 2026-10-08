// Pure spread-math functions - no I/O, no Binance/Alpaca/Finnhub calls here. Keeping these pure
// is what makes them cheaply testable (see spread.test.ts) and is explicitly mandated by
// docs/arbitrage-and-data-fetching.md §C.

export type SpreadResult = {
  spreadPct: number;
  spreadBps: number;
  /** on-chain richer than reference (positive) = sell on-chain; negative = buy on-chain. */
  direction: "buy" | "trim" | "watch";
};

/**
 * Normalizes a token's on-chain price to a per-share price. A handful of RWA tokens (mostly on
 * Ondo) bundle several underlying shares into one token (tokenToShareRatio != 1); dividing first
 * is mandatory before comparing against any per-share reference price (Binance's own
 * referencePrice, or an independent feed - both are per-share).
 *
 * Returns null (never 0 or NaN) when the inputs can't be trusted, so callers skip the token
 * instead of coercing it into a bogus -100% spread.
 */
export function normalizePerSharePrice(tokenPrice: unknown, tokenToShareRatio: unknown): number | null {
  const price = Number(tokenPrice);
  const ratio = Number(tokenToShareRatio);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return price / ratio;
}

/**
 * Gross spread between an on-chain (per-share) price and a reference (per-share) price.
 * spread% = (onchain - reference) / reference * 100. Positive = on-chain richer (sell on-chain);
 * negative = on-chain cheaper (buy on-chain). Returns null on untrustworthy inputs rather than a
 * 0 or a divide-by-zero NaN/Infinity, so a bad reading is skipped, not silently shown as "0% / no
 * opportunity" (a 0 or null referencePrice must never be coerced to 0, see arbitrage doc §A9).
 */
export function computeSpread(onchainPrice: unknown, referencePrice: unknown): SpreadResult | null {
  const onchain = Number(onchainPrice);
  const reference = Number(referencePrice);
  if (!Number.isFinite(onchain) || onchain <= 0) return null;
  if (!Number.isFinite(reference) || reference <= 0) return null;

  const spreadPct = ((onchain - reference) / reference) * 100;
  const spreadBps = Math.round(spreadPct * 100);
  return { spreadPct, spreadBps, direction: classifyDirection(spreadBps) };
}

/** absSpread below this threshold is noise, not a real signal, regardless of sign. */
const WATCH_THRESHOLD_BPS = 5;

export function classifyDirection(spreadBps: number): "buy" | "trim" | "watch" {
  if (Math.abs(spreadBps) < WATCH_THRESHOLD_BPS) return "watch";
  return spreadBps < 0 ? "buy" : "trim";
}

/**
 * Sanity bound: a spread wider than this is almost always a data bug (mismatched decimals, a
 * halted/illiquid token, a stale leg) rather than a real arbitrage opportunity - drop it instead
 * of surfacing it as the best-looking (biggest) opportunity. See arbitrage doc §A10.
 */
export function isOutlier(spreadPct: number, boundPct = 20): boolean {
  return Math.abs(spreadPct) > boundPct;
}

/** now/updatedAt/maxAgeMs all in epoch ms. A missing/invalid updatedAt counts as stale. */
export function isStale(nowMs: number, updatedAtMs: number | null | undefined, maxAgeMs: number): boolean {
  if (!Number.isFinite(updatedAtMs as number) || !updatedAtMs) return true;
  return nowMs - updatedAtMs > maxAgeMs;
}

/**
 * Parses Binance candle rows into a close-price series. Documented shape (binance-web3-context.md
 * §4.1/§8): each row is a plain array `[open, high, low, close, volume, timestampMs, tradeCount]`,
 * values possibly numbers or numeric strings - never an object with a "close"/"c"/"price" key.
 * Confirmed empirically against a live response (MVLLB) during the audit.
 */
export function parseCandleCloses(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const closes: number[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const close = Number(row[3]);
    if (Number.isFinite(close) && close > 0) closes.push(close);
  }
  return closes;
}

/**
 * Whether a spread reading is safe to act on. Unknown market state is treated as closed
 * (fail safe) - an undefined/missing openState must never be read as "open". See arbitrage doc §A6.
 */
export function isTradeable(marketOpen: boolean | null | undefined): boolean {
  return marketOpen === true;
}
