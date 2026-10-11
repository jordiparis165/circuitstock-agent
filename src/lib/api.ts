// Shared types + fetch helpers for the pivoted (paper-only, conversational-agent) product.
// See PIVOT_ROADMAP.md - every field here mirrors an actual server/agent/*.ts type, not the
// aspirational roadmap text, so the frontend never guesses a shape.

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

// --- Settings (server/agent/settings.ts) ---

export type AgentPreset = "prudent" | "balanced" | "dynamic";

export type PivotSettings = {
  agent_enabled: boolean;
  mode: "confirm" | "auto";
  max_order_usd: number;
  min_order_usd: number;
  daily_cap_usd: number;
  premium_noise_pct: number;
  premium_warn_pct: number;
  rotation_k: number;
  rotation_min_gain_usd: number;
  rotation_cooldown_h: number;
  max_route_cost_pct: number;
  allowed_issuers: Array<"ondo" | "bstock">;
  allowed_sectors: string[];
  allowed_tickers: string[];
  require_audit: boolean;
  audit_block_level: "MEDIUM" | "HIGH";
  use_news: boolean;
  notifications: { in_app: boolean; browser: boolean };
  preset: AgentPreset;
};

export type SettingsChange = {
  at: string;
  actor: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
};

// --- Chat agent (server/agent/toolTypes.ts, chatTools.ts) ---

export type AgentCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "na";
  value?: string;
  threshold?: string;
  source: string;
  age_s?: number;
};

export type AgentCard = {
  type: "simulated_buy" | "premium_check" | "rotation" | "alert_draft" | "plan_draft" | "settings_change" | "disabled" | "general";
  title: string;
  summary: string;
  simulated: boolean;
  ticker?: string;
  amount_usd?: string;
  checks: AgentCheck[];
  details: Record<string, unknown>;
  would_change_if: string[];
};

export type AgentChatResponse = {
  ok: boolean;
  reply: string;
  card: AgentCard;
  tools: string[];
  disclaimer: string;
};

// --- Market overview / dashboard (chatTools.ts marketOverview()) ---

export type MarketOverview = {
  ok: boolean;
  replay: boolean;
  capturedAt: string;
  market: { open: boolean; state: string; next_open: number; next_close: number };
  heatmap: Array<{ ticker: string; ondo: string; bstock: string; reference: string | null; gross_spread_pct: string }>;
};

// --- Portfolio / rebalance (agent/runner.ts AgentDecision via /api/rebalance/suggestions) ---

export type AgentIntent = {
  action: "rotate" | "hold" | "derisk" | "reenter";
  from_token?: { chain: string; address: string; platform: "ondo" | "bstock" };
  to_token?: { chain: string; address: string; platform: "ondo" | "bstock" };
  size_usd: string;
  max_slippage_pct: string;
  confidence: number;
  rationale: string;
};

export type AgentOpportunity = {
  ticker: string;
  pairKey: string;
  chain: string;
  sizeUsd: string;
  grossSpreadPct: string;
  netEdgePct: string;
  reason: string;
};

export type AgentDecision = {
  requestId: string;
  at: string;
  mode: "paper" | "live";
  action: "rotate" | "hold" | "derisk" | "reenter";
  outcome: "paper-filled" | "simulation-mismatch" | "rejected" | "held" | "blocked-live";
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

export type Portfolio = {
  ok: boolean;
  simulated: boolean;
  holdings: unknown[];
  message: string;
};

// --- Alerts (server/agent/alerts.ts) ---

export type AlertRule = {
  id: string;
  type: "price" | "premium" | "issuer_gap" | "market_state" | "news" | "audit_risk" | "rotation_gain" | "plan_event";
  ticker: string;
  issuer?: string;
  condition: { op: ">" | "<" | "crosses"; value: string };
  cooldown_s: number;
  channels: Array<"in_app" | "browser">;
  enabled: boolean;
  created_at: string;
  last_triggered_at?: string;
};

export type AlertTrigger = { id: string; alertId: string; at: string; message: string; test: boolean };

// --- Plans (server/agent/plans.ts) ---

export type Plan = {
  id: string;
  name: string;
  amount_usd: string;
  frequency: "daily" | "weekly" | "monthly" | "one_shot";
  schedule: string;
  basket: { mode: "tickers" | "sector" | "theme"; tickers?: string[]; sector?: string; theme?: string; weights: "equal" | "custom" };
  constraints: { issuer: "cheapest"; max_premium_pct: string; skip_if_market_closed: true };
  status: "draft" | "active" | "paused";
  created_at: string;
  last_run_at?: string;
};

// --- Skills (server/skills/log.ts) ---

export type SkillLogEntry = {
  at: string;
  skill: string;
  endpoint: string;
  status: "ok" | "failed" | "disabled";
  latencyMs: number;
  summary: string;
};

export type SkillCheckResult = {
  ok: boolean;
  checks: Array<{ skill: string; ok: boolean; error?: string }>;
  calls: SkillLogEntry[];
};

// --- Opportunities (P2, news - disabled unless a source is confirmed) ---

export type Opportunities = {
  ok: boolean;
  newsEnabled: boolean;
  reason?: string;
  overview: MarketOverview;
};
