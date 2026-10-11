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
  /** How the answer was produced, so the UI can be honest about the model's involvement. */
  llm?: {
    available: boolean;
    model?: string;
    routedTo?: string;
    /** True when the model rephrased the deterministic reply. The figures are never its own. */
    explained?: boolean;
    reason?: string;
  };
};

