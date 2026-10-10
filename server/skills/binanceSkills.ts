import crypto from "node:crypto";
import { logSkillCall } from "./log";

const TOKENIZED_BASE = "https://www.binance.com/bapi/defi";
const AUDIT_URL = "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit";

async function measured<T>(skill: string, endpoint: string, fn: () => Promise<T>, summary: (value: T) => string): Promise<T> {
  const started = Date.now();
  try {
    const value = await fn();
    logSkillCall({ at: new Date().toISOString(), skill, endpoint, status: "ok", latencyMs: Date.now() - started, summary: summary(value) });
    return value;
  } catch (error) {
    logSkillCall({
      at: new Date().toISOString(),
      skill,
      endpoint,
      status: "failed",
      latencyMs: Date.now() - started,
      summary: error instanceof Error ? error.message : "skill call failed"
    });
    throw error;
  }
}

async function getSkillJson<T>(skill: string, endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return measured(
    skill,
    url.pathname,
    async () => {
      const response = await fetch(url, {
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent": skill === "query-token-info" ? "binance-web3/2.0 (Skill)" : "binance-web3/1.1 (Skill)"
        }
      });
      if (!response.ok) throw new Error(`Skill HTTP ${response.status}`);
      return (await response.json()) as T;
    },
    () => "read-only skill call"
  );
}

export function getOndoMarketStatus(): Promise<unknown> {
  return getSkillJson(
    "binance-tokenized-securities-info",
    `${TOKENIZED_BASE}/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai`
  );
}

export function listOndoTokens(): Promise<unknown> {
  return getSkillJson(
    "binance-tokenized-securities-info",
    `${TOKENIZED_BASE}/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai`,
    { type: "1" }
  );
}

export function getOndoDynamic(chainId: string, contractAddress: string): Promise<unknown> {
  return getSkillJson(
    "binance-tokenized-securities-info",
    `${TOKENIZED_BASE}/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai`,
    { chainId, contractAddress }
  );
}

export async function auditToken(chainId: string, contractAddress: string): Promise<unknown> {
  return measured(
    "query-token-audit",
    "/bapi/defi/v1/public/wallet-direct/security/token/audit",
    async () => {
      const response = await fetch(AUDIT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": "binance-web3/1.4 (Skill)",
          source: "agent"
        },
        body: JSON.stringify({ binanceChainId: chainId, contractAddress, requestId: crypto.randomUUID() })
      });
      if (!response.ok) throw new Error(`Skill HTTP ${response.status}`);
      return response.json();
    },
    () => "token audit read"
  );
}

export function queryTokenInfoDynamic(chainId: string, contractAddress: string): Promise<unknown> {
  return getSkillJson("query-token-info", `https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/dynamic/ai`, {
    chainId,
    contractAddress
  });
}

