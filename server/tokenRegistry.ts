export type TokenSource = "bStocks" | "Ondo";

export type TokenRegistryItem = {
  symbol: string;
  ticker: string;
  name: string;
  source: TokenSource;
  decimals: number;
  address?: string;
  referenceSymbol: string;
};

// `||` on purpose, not `??`: BSC_USDC_ADDRESS=<empty> in .env is a present-but-empty string, and
// `??` only falls back on null/undefined - it silently kept the empty string before, which made
// every quote fail further downstream with Binance's confusing "[fromTokenAddress] is required"
// instead of actually using the fallback address. See docs/dx-report-notes.md.
export const quoteTokens = {
  usdc: {
    symbol: "USDC",
    decimals: 18,
    address: process.env.BSC_USDC_ADDRESS || "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
  },
  usdt: {
    symbol: "USDT",
    decimals: 18,
    address: process.env.BSC_USDT_ADDRESS || "0x55d398326f99059fF775485246999027B3197955"
  }
};

export type QuoteTokenKey = keyof typeof quoteTokens;

/**
 * Which stablecoin a platform accepts for quoting/swapping, keyed by platformId then
 * binanceChainId. This is NOT a guess: Ondo on BSC rejects USDC outright with
 * `40368 "Ondo asset on chain 56 can only pair with allowed stablecoin(s)"` and accepts USDT;
 * bStock on BSC accepts both. See docs/binance-web3-context.md §5.2 for the full empirical record,
 * including what we tried and could NOT confirm (Ondo on Ethereum - no liquid route either way at
 * test time, so the right stablecoin there is unverified, not assumed).
 */
const PLATFORM_QUOTE_TOKEN: Record<string, Record<string, QuoteTokenKey>> = {
  ondo: { "56": "usdt" },
  bstock: { "56": "usdc" }
};

const DEFAULT_QUOTE_TOKEN: QuoteTokenKey = "usdc";

/**
 * Resolves the stablecoin a given platform+chain combo accepts. Falls back to USDC (verified for
 * bstock/56; unverified but historically what this app used everywhere else) when the exact
 * platform+chain isn't in the table above - this only ever needs expanding, never guessing per call.
 */
export function getQuoteToken(platformId: string | undefined, binanceChainId: string | number = "56") {
  const key = PLATFORM_QUOTE_TOKEN[(platformId ?? "").toLowerCase()]?.[String(binanceChainId)] ?? DEFAULT_QUOTE_TOKEN;
  return quoteTokens[key];
}

export const tokenRegistry: TokenRegistryItem[] = [
  {
    symbol: "TSLAb",
    ticker: "TSLA",
    name: "Tesla bStock",
    source: "bStocks",
    decimals: 18,
    address: process.env.TSLAB_ADDRESS || "0x5b1910eaad6450e50f816082aa078c41f10c292f",
    referenceSymbol: "TSLA"
  },
  {
    symbol: "SPYON",
    ticker: "SPY",
    name: "S&P 500 tokenized exposure",
    source: "Ondo",
    decimals: 18,
    address: process.env.SPYON_ADDRESS || undefined,
    referenceSymbol: "SPY"
  },
  {
    symbol: "NVDAb",
    ticker: "NVDA",
    name: "NVIDIA bStock",
    source: "bStocks",
    decimals: 18,
    address: process.env.NVDAB_ADDRESS || undefined,
    referenceSymbol: "NVDA"
  }
];

export function getToken(symbol: string): TokenRegistryItem | undefined {
  return tokenRegistry.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
}

export function platformIdForSource(source: TokenSource): string {
  return source === "Ondo" ? "ondo" : "bstock";
}
