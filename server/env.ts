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
  simulatePath: pickEnv(["BINANCE_WEB3_SIMULATE_PATH"]) ?? "/api/v1/dex/pre-transaction/simulate",
  rwaTokensPath: pickEnv(["BINANCE_WEB3_RWA_TOKENS_PATH"]) ?? "/api/v1/dex/market/rwa/tokens",
  rwaPricePath: pickEnv(["BINANCE_WEB3_RWA_PRICE_PATH"]) ?? "/api/v1/dex/market/rwa/price",
  bscRpcUrl: pickEnv(["BSC_RPC_URL"]) ?? "https://bsc-dataseed.binance.org"
};

export function maskSecret(value?: string): string | null {
  if (!value) return null;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
