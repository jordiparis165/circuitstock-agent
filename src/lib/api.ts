export type Health = {
  ok: boolean;
  apiConfigured: boolean;
  apiKeyStatus: "configured" | "missing";
  quotePathConfigured: boolean;
  baseUrl: string;
  bscRpcUrl: string;
  supportedPlatforms: string[];
};

export type Quote = {
  symbol: string;
  name: string;
  tokenSource: "bStocks" | "Ondo";
  onchainPrice: number;
  referencePrice: number;
  spreadBps: number;
  liquidityUsd: number;
  marketWindow: "open" | "closed" | "pre-market" | "after-hours";
  contractReady: boolean;
  shareRatio: number;
};

export type StrategyAction = {
  symbol: string;
  action: "buy" | "trim" | "watch";
  reason: string;
  simulatedUsd: number;
  score?: number;
  tokenAddress?: string;
  nextStep: string;
};

export type Strategy = {
  mode: string;
  risk: "balanced" | "aggressive";
  actions: StrategyAction[];
  rules: {
    maxTradeUsd: number;
    minScore?: number;
    requiresSimulation: boolean;
    requiresUserSignature: boolean;
    broadcasted?: boolean;
  };
};

export type PreparedTx = {
  from?: string;
  to: string;
  value?: string;
  data?: string;
  gas?: string;
};

export type ExecutionPreview = {
  ok: boolean;
  mode?: string;
  error?: string;
  humanStatus?: string;
  nextRequiredAction?: string;
  selectedQuote?: {
    quoteId?: string;
    vendorName?: string;
    toTokenAmount?: string;
    priceImpactPercent?: string;
    estimateGasFee?: string;
    approveTarget?: string;
    router?: string;
  };
  approvalTx?: PreparedTx | null;
  swapTx?: PreparedTx | null;
  evmTx?: PreparedTx | null;
  checklist?: {
    quote: boolean;
    approvalCalldata?: boolean;
    swapBuilt: boolean;
    simulated: boolean;
    walletBalances?: boolean;
    officialApproval?: boolean;
    gasEstimated?: boolean;
    researchLoaded?: boolean;
    requiresUserSignature: boolean;
    broadcasted: boolean;
  };
  gasPrice?: { ok: boolean; data?: unknown } | null;
  gasLimit?: { ok: boolean; data?: unknown } | null;
  walletSnapshot?: { balances?: { ok?: boolean } | null; portfolio?: { ok?: boolean } | null };
  research?: {
    candleSummary?: {
      points: number;
      volatilityBps: number | null;
      changeBps: number | null;
      signal: string;
    } | null;
    underlyingProfile?: { ok?: boolean } | null;
    underlyingMarket?: { ok?: boolean } | null;
  };
  apiWarnings?: Array<{ kind?: string; message?: string; status?: number }>;
  simulationSummary?: {
    status?: string;
    failReason?: string;
    humanStatus?: string;
    nextRequiredAction?: string;
    severity?: string;
  } | null;
  request?: {
    symbol: string;
    side: string;
    amountUsd: number;
    walletAddress?: string;
  };
};

export type Evidence = {
  ok: boolean;
  modules: string[];
  recentCalls: Array<{
    module: string;
    endpoint: string;
    status: "ok" | "failed";
    latencyMs: number;
    at: string;
    note?: string;
  }>;
};

export type AgentInterpretation = {
  ok: boolean;
  spokenSummary?: string;
  intent?: {
    symbol: string;
    side: string;
    amountUsd: number;
    quoteOnly: boolean;
    researchOnly: boolean;
  };
  execution?: ExecutionPreview | null;
};

export type WatcherPolicy = {
  minSpreadBps: number;
  minScore: number;
  minLiquidityUsd: number;
  maxTradeUsd: number;
  maxDailyUsd: number;
  maxSlippageBps: number;
  cooldownSec: number;
  allowedSymbols: string[];
};

export type WatcherStatus = {
  enabled: boolean;
  running: boolean;
  killed: boolean;
  lastTickAt: string | null;
  spentTodayUsd: number;
  policy: {
    mode: "dry-run" | "live";
    intervalSec: number;
    minSpreadBps: number;
    minScore: number;
    minLiquidityUsd: number;
    maxTradeUsd: number;
    maxDailyUsd: number;
    maxSlippageBps: number;
    cooldownSec: number;
    allowedSymbols: string[];
    walletAddress?: string;
  };
  decisions: Array<{
    at: string;
    symbol: string | null;
    side: "buy" | "sell" | null;
    amountUsd: number;
    outcome: "would-execute" | "executed" | "skipped" | "idle" | "error";
    reasons: string[];
  }>;
};

export type BasketPlan = {
  ok: boolean;
  theme: string;
  label: string;
  thesis: string;
  risk: "balanced" | "aggressive";
  amountUsd: number;
  cacheStatus: string;
  requiredUserAction: string;
  summary: string;
  legs: Array<{
    symbol: string;
    name: string;
    tokenSource: string;
    tokenAddress: string;
    allocationUsd: number;
    weightPct: number;
    action: "buy" | "watch";
    spreadBps: number;
    liquidityUsd: number;
    score: number;
    reason: string;
  }>;
};

export type Readiness = {
  ok: boolean;
  links: Record<string, string>;
  checklist: Array<{ item: string; status: "ready" | "todo" | "missing" }>;
};

export type AiAgentResult = {
  ok: boolean;
  mode: "llm" | "deterministic";
  configured: boolean;
  model: string;
  answer: string;
  cacheStatus?: string;
  safety: {
    broadcasts_transactions: false;
    requires_user_signature: true;
    chain: "BSC mainnet";
  };
  error?: string;
};

export type WalletReadiness = {
  ok: boolean;
  chain: string;
  blockNumber: number;
  wallet: string;
  checks: {
    bscMainnet: boolean;
    usdcContractCode: boolean;
    hasGas: boolean;
    hasUsdc: boolean;
    hasAllowance: boolean;
    noBroadcast: boolean;
  };
  balances: {
    bnb: string;
    usdc: string;
    usdcAllowance: string;
  };
  nextRequiredAction: string;
};

export type SmokeResult = {
  ok: boolean;
  latencyMs: number;
  checks: Array<{ name: string; ok: boolean; detail?: unknown }>;
  readiness: Readiness;
};

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
export const FALLBACK_API_BASE = "https://circuitstock-agent-api.onrender.com";

export const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const compactUsd = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function shortAddress(value?: string | null) {
  if (!value) return "--";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}
