export type TokenSource = "bStocks" | "xStocks" | "Ondo";

export type TokenRegistryItem = {
  symbol: string;
  ticker: string;
  name: string;
  source: TokenSource;
  decimals: number;
  address?: string;
  referenceSymbol: string;
};

export const quoteTokens = {
  usdc: {
    symbol: "USDC",
    decimals: 18,
    address: process.env.BSC_USDC_ADDRESS ?? "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
  }
};

export const tokenRegistry: TokenRegistryItem[] = [
  {
    symbol: "AAPLx",
    ticker: "AAPL",
    name: "Apple tokenized stock",
    source: "xStocks",
    decimals: 18,
    address: process.env.AAPLX_ADDRESS,
    referenceSymbol: "AAPL"
  },
  {
    symbol: "TSLAb",
    ticker: "TSLA",
    name: "Tesla bStock",
    source: "bStocks",
    decimals: 18,
    address: process.env.TSLAB_ADDRESS ?? "0x5b1910eaad6450e50f816082aa078c41f10c292f",
    referenceSymbol: "TSLA"
  },
  {
    symbol: "SPYON",
    ticker: "SPY",
    name: "S&P 500 tokenized exposure",
    source: "Ondo",
    decimals: 18,
    address: process.env.SPYON_ADDRESS,
    referenceSymbol: "SPY"
  },
  {
    symbol: "NVDAb",
    ticker: "NVDA",
    name: "NVIDIA bStock",
    source: "bStocks",
    decimals: 18,
    address: process.env.NVDAB_ADDRESS,
    referenceSymbol: "NVDA"
  }
];

export function getToken(symbol: string): TokenRegistryItem | undefined {
  return tokenRegistry.find((token) => token.symbol.toLowerCase() === symbol.toLowerCase());
}
