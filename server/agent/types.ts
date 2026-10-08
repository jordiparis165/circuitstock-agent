export type AgentMode = "paper" | "live";
export type AgentAction = "rotate" | "hold" | "derisk" | "reenter";
export type Platform = "ondo" | "bstock";

export type SnapshotToken = {
  platform: Platform;
  address: string;
  price_per_share: string;
  price_age_s: number;
  liquidity_usd: string;
  isHoneyPot?: boolean;
  taxRate?: string;
};

export type AgentSnapshotPair = {
  ticker: string;
  chain: string;
  a: SnapshotToken;
  b: SnapshotToken;
  gross_spread_pct: string;
  reference?: {
    price: string;
    source: string;
    age_s: number;
    premium_pct: string;
  };
};

export type AgentSnapshot = {
  ts: number;
  mode: AgentMode;
  market: {
    open: boolean;
    state: string;
    next_open: number;
    next_close: number;
  };
  pairs: AgentSnapshotPair[];
};

export type AgentIntent = {
  action: AgentAction;
  from_token?: { chain: string; address: string; platform: Platform };
  to_token?: { chain: string; address: string; platform: Platform };
  size_usd: string;
  max_slippage_pct: string;
  confidence: number;
  rationale: string;
};

export type AgentOpportunity = {
  ticker: string;
  pairKey: string;
  chain: string;
  from: SnapshotToken;
  to: SnapshotToken;
  sizeUsd: string;
  grossSpreadPct: string;
  netEdgePct: string;
  reason: string;
};

export type AgentDecision = {
  requestId: string;
  at: string;
  mode: AgentMode;
  action: AgentAction;
  outcome: "paper-filled" | "rejected" | "held" | "blocked-live";
  intent: AgentIntent;
  opportunity?: AgentOpportunity;
  violations: string[];
  paperSimulation?: {
    status: "SUCCESS" | "SKIPPED";
    balanceChanges: Array<{ token: string; direction: "in" | "out"; amountUsd: string }>;
    quoteExpiresInSec: number;
  };
  rationale: string;
};

export type LlmClient = {
  propose(input: { snapshot: AgentSnapshot; opportunity?: AgentOpportunity; marketAction: AgentAction }): Promise<AgentIntent>;
};

