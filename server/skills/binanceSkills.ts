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

export type AuditVerdict = {
  /** False whenever the skill could not actually assess this token. Per the skill's own rule, a
   *  response is only a verdict when it reports both hasResult and isSupported - anything else is
   *  "unknown", which must not be read as "safe". */
  usable: boolean;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  /** Risk names the response flagged as hit, for display next to the verdict. */
  hits: string[];
  reason?: string;
};

// The API spells its mid tier "MID"; settings and the UI use "MEDIUM".
function normalizeRiskLevel(value: unknown): AuditVerdict["riskLevel"] {
  const raw = String(value ?? "").toUpperCase();
  if (raw === "HIGH") return "HIGH";
  if (raw === "MID" || raw === "MEDIUM") return "MEDIUM";
  if (raw === "LOW") return "LOW";
  return "UNKNOWN";
}

/** Applies the skill's validation rule so callers get a decision, not a raw payload. */
export async function auditTokenVerdict(chainId: string, contractAddress: string): Promise<AuditVerdict> {
  let payload: unknown;
  try {
    payload = await auditToken(chainId, contractAddress);
  } catch (error) {
    return { usable: false, riskLevel: "UNKNOWN", hits: [], reason: (error as Error).message };
  }

  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data) return { usable: false, riskLevel: "UNKNOWN", hits: [], reason: "Audit response had no data block." };
  if (data.hasResult !== true) return { usable: false, riskLevel: "UNKNOWN", hits: [], reason: "Audit returned no result for this token." };
  if (data.isSupported !== true) return { usable: false, riskLevel: "UNKNOWN", hits: [], reason: "Token is not supported by the audit skill." };

  const riskItems = (data.riskItems as Array<{ name?: string; details?: Array<{ title?: string; isHit?: boolean }> }>) ?? [];
  const hits = riskItems
    .flatMap((item) => (item.details ?? []).filter((detail) => detail.isHit).map((detail) => detail.title ?? item.name ?? "unnamed risk"))
    .filter(Boolean) as string[];

  return { usable: true, riskLevel: normalizeRiskLevel(data.riskLevelEnum), hits };
}

/** True when settings say this verdict must block a simulated action. An unusable verdict blocks
 *  too when audits are required: "we could not check" is not "it is fine". */
export function auditBlocks(verdict: AuditVerdict, requireAudit: boolean, blockLevel: "MEDIUM" | "HIGH"): boolean {
  if (!requireAudit) return false;
  if (!verdict.usable) return true;
  return blockLevel === "HIGH" ? verdict.riskLevel === "HIGH" : verdict.riskLevel === "HIGH" || verdict.riskLevel === "MEDIUM";
}

export function queryTokenInfoDynamic(chainId: string, contractAddress: string): Promise<unknown> {
  return getSkillJson("query-token-info", `https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/dynamic/ai`, {
    chainId,
    contractAddress
  });
}

