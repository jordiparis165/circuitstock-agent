import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

type RawEnv = Record<string, string>;

function readRawEnv(): RawEnv {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return {};

  const raw: RawEnv = {};
  const contents = fs.readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    raw[key] = value;
  }
  return raw;
}

const rawEnv = readRawEnv();

function pickEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key] ?? rawEnv[key];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export const config = {
  apiKey: pickEnv(["BINANCE_WEB3_API_KEY", "BINANCE_API_KEY", "Cle API", "Clé API", "ClÃ© API"]),
  apiSecret: pickEnv([
    "BINANCE_WEB3_API_SECRET",
    "BINANCE_API_SECRET",
    "Cle secrete",
    "Clé secrète",
    "ClÃ© secrÃ¨te"
  ]),
  baseUrl: pickEnv(["BINANCE_WEB3_BASE_URL"]) ?? "https://web3.binance.com/build",
  quotePath: pickEnv(["BINANCE_WEB3_QUOTE_PATH"]) ?? "/api/v1/dex/aggregator/quote",
  swapPath: pickEnv(["BINANCE_WEB3_SWAP_PATH"]) ?? "/api/v1/dex/aggregator/swap",
  approvePath: pickEnv(["BINANCE_WEB3_APPROVE_PATH"]) ?? "/api/v1/dex/aggregator/approve-transaction",
  aggregatorHistoryPath: pickEnv(["BINANCE_WEB3_AGGREGATOR_HISTORY_PATH"]) ?? "/api/v1/dex/aggregator/history",
  simulatePath: pickEnv(["BINANCE_WEB3_SIMULATE_PATH"]) ?? "/api/v1/dex/pre-transaction/simulate",
  gasPricePath: pickEnv(["BINANCE_WEB3_GAS_PRICE_PATH"]) ?? "/api/v1/dex/pre-transaction/gas-price",
  gasLimitPath: pickEnv(["BINANCE_WEB3_GAS_LIMIT_PATH"]) ?? "/api/v1/dex/pre-transaction/gas-limit",
  rwaTokensPath: pickEnv(["BINANCE_WEB3_RWA_TOKENS_PATH"]) ?? "/api/v1/dex/market/rwa/tokens",
  rwaPricePath: pickEnv(["BINANCE_WEB3_RWA_PRICE_PATH"]) ?? "/api/v1/dex/market/rwa/price",
  rwaPlatformsPath: pickEnv(["BINANCE_WEB3_RWA_PLATFORMS_PATH"]) ?? "/api/v1/dex/market/rwa/platforms",
  rwaSearchPath: pickEnv(["BINANCE_WEB3_RWA_SEARCH_PATH"]) ?? "/api/v1/dex/market/rwa/search",
  rwaUnderlyingProfilePath:
    pickEnv(["BINANCE_WEB3_RWA_UNDERLYING_PROFILE_PATH"]) ?? "/api/v1/dex/market/rwa/underlying-profile",
  rwaUnderlyingMarketPath:
    pickEnv(["BINANCE_WEB3_RWA_UNDERLYING_MARKET_PATH"]) ?? "/api/v1/dex/market/rwa/underlying-market",
  marketCandlesPath: pickEnv(["BINANCE_WEB3_MARKET_CANDLES_PATH"]) ?? "/api/v1/dex/market/candles",
  walletAllBalancesPath:
    pickEnv(["BINANCE_WEB3_WALLET_ALL_BALANCES_PATH"]) ?? "/api/v1/dex/balance/all-token-balances-by-address",
  walletPortfolioOverviewPath:
    pickEnv(["BINANCE_WEB3_WALLET_PORTFOLIO_OVERVIEW_PATH"]) ?? "/api/v1/dex/market/portfolio/overview",
  bscRpcUrl: pickEnv(["BSC_RPC_URL"]) ?? "https://bsc-dataseed.binance.org"
};

export function maskSecret(value?: string): string | null {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
