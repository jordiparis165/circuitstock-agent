import { auditBlocks, auditTokenVerdict } from "../skills/binanceSkills";
import { createAlert, listAlerts, parseAlertDraft } from "./alerts";
import { loadSampleSnapshot } from "./fixtures";
import { explainCard, llmStatus, routeMessage, type ChatRoute, type ChatTool } from "./llm";
import { recordTokens, tokenBudgetAvailable } from "./llmBudget";
import { createPlan, listPlans, parsePlanDraft } from "./plans";
import { runAgentCycle } from "./runner";
import { previewPreset, readSettings, type PivotSettings } from "./settings";
import type { AgentCard, AgentChatResponse, AgentCheck } from "./toolTypes";
import type { AgentSnapshot, SnapshotToken } from "./types";

const disclaimer = "Informational and experimental only. Simulated actions are not financial advice and never sign or broadcast transactions.";

function pass(id: string, label: string, value: string, threshold: string, source = "settings", age_s?: number): AgentCheck {
  return { id, label, status: "pass", value, threshold, source, age_s };
}

function fail(id: string, label: string, value: string, threshold: string, source = "settings", age_s?: number): AgentCheck {
  return { id, label, status: "fail", value, threshold, source, age_s };
}

function na(id: string, label: string, value = "not available", source = "not verified"): AgentCheck {
  return { id, label, status: "na", value, source };
}

function pairFor(snapshot: AgentSnapshot, ticker: string) {
  return snapshot.pairs.find((pair) => pair.ticker.toUpperCase() === ticker.toUpperCase());
}

function cheaperIssuer(a: SnapshotToken, b: SnapshotToken): SnapshotToken {
  return Number(a.price_per_share) <= Number(b.price_per_share) ? a : b;
}

function premiumChecks(token: SnapshotToken, settings: PivotSettings, referencePrice?: string): AgentCheck[] {
  const freshness =
    token.price_age_s <= 120
      ? pass("age", "Token price freshness", `${token.price_age_s}s`, "<= 120s", "snapshot", token.price_age_s)
      : fail("age", "Token price freshness", `${token.price_age_s}s`, "<= 120s", "snapshot", token.price_age_s);

  // Freshness is independent of the reference: a missing reference must not hide a stale price.
  if (!referencePrice) {
    return [na("reference", "Premium vs independent reference", "no reference source configured", "reference"), freshness];
  }

  const premiumPct = ((Number(token.price_per_share) - Number(referencePrice)) / Number(referencePrice)) * 100;
  return [
    Math.abs(premiumPct) <= settings.premium_warn_pct
      ? pass("premium", "Premium below warning threshold", `${premiumPct.toFixed(3)}%`, `<= ${settings.premium_warn_pct}%`, "snapshot/reference")
      : fail("premium", "Premium below warning threshold", `${premiumPct.toFixed(3)}%`, `<= ${settings.premium_warn_pct}%`, "snapshot/reference"),
    freshness
  ];
}

/**
 * Real Wallet Skill call.
 *
 * Three outcomes, kept distinct on purpose: a clean verdict passes, a risky verdict fails, and a
 * token the skill cannot assess is reported as unknown. Measured on 2026-10-11, the audit skill
 * returns `hasResult: false` for tokenized securities (it answers normally for plain BEP-20 such
 * as USDT), so "unknown" is the usual answer for this asset class. Marking that as a pass would
 * claim a safety check we did not get; marking it as a failure would block every ticker. It is
 * surfaced as unknown so the user sees exactly what the skill did and did not tell us.
 */
async function auditCheck(token: SnapshotToken, settings: PivotSettings): Promise<AgentCheck> {
  if (!settings.require_audit) return na("audit", "Token security audit", "not required", "settings");
  const verdict = await auditTokenVerdict("56", token.address);
  if (!verdict.usable) {
    return na("audit", "Token security audit", "not covered for tokenized securities", "skill:query-token-audit");
  }
  const value = `${verdict.riskLevel}${verdict.hits.length ? ` (${verdict.hits.length} flags)` : ""}`;
  return auditBlocks(verdict, settings.require_audit, settings.audit_block_level)
    ? fail("audit", "Token security audit", value, `below ${settings.audit_block_level}`, "skill:query-token-audit")
    : pass("audit", "Token security audit", value, `below ${settings.audit_block_level}`, "skill:query-token-audit");
}

function disabledCard(settings: PivotSettings): AgentChatResponse {
  return {
    ok: true,
    reply: "Agent is disabled. I will not create suggestions, alerts or plans until you re-enable it.",
    disclaimer,
    tools: ["settings.policy"],
    card: {
      type: "disabled",
      title: "Agent disabled",
      summary: "Dashboard data remains visible, but agent actions are blocked by the global kill switch.",
      simulated: true,
      checks: [fail("agent_enabled", "Agent enabled", String(settings.agent_enabled), "true", "settings")],
      details: { settings },
      would_change_if: ["Turn the agent back on in Settings."]
    }
  };
}

/**
 * Runs one tool with already-resolved arguments. No LLM, no parsing: this is the path the
 * quick-action buttons use, so the product keeps working when the model is down or out of budget.
 */
export async function runChatTool(
  tool: ChatTool,
  args: { ticker?: string; amount_usd?: string; preset?: string; message?: string }
): Promise<AgentChatResponse> {
  const settings = readSettings();
  if (!settings.agent_enabled) return disabledCard(settings);
  return dispatch(settings, { tool, ticker: args.ticker, amount_usd: args.amount_usd, preset: args.preset as ChatRoute["preset"] }, args.message ?? "");
}

/**
 * Free-text entry point. The model decides *which* tool and *with what arguments*; the tool
 * itself then computes every figure and check deterministically. If the model is unavailable the
 * caller gets an explicit `llm.available: false` instead of a fabricated answer.
 */
export async function handleAgentChat(message: string): Promise<AgentChatResponse> {
  const settings = readSettings();
  if (!settings.agent_enabled) return disabledCard(settings);

  const status = llmStatus();
  if (status.configured && !tokenBudgetAvailable()) {
    return llmUnavailableCard("The daily LLM budget for this public demo is spent. The quick actions below still work.");
  }

  const routed = await routeMessage(message);
  if (!routed.ok) return llmUnavailableCard(routed.error);
  if (routed.usedTokens > 0) recordTokens(routed.usedTokens);

  const response = await dispatch(settings, routed.route, message);
  response.llm = status.configured
    ? { available: true, model: status.model, routedTo: routed.route.tool }
    : { available: false, reason: status.reason, routedTo: routed.route.tool };

  // The explanation is a nicety: if it fails we keep the deterministic reply rather than error.
  if (status.configured && tokenBudgetAvailable()) {
    const explained = await explainCard({ message, reply: response.reply, card: response.card });
    if (explained) {
      recordTokens(explained.usedTokens);
      response.reply = explained.text;
      response.llm.explained = true;
    }
  }
  return response;
}

/** Single dispatcher shared by the LLM path and the quick actions, so both behave identically.
 *  `message` is only used by the alert/plan drafters, which need the original wording to read a
 *  threshold or a cadence out of it. */
async function dispatch(settings: PivotSettings, route: ChatRoute, message: string): Promise<AgentChatResponse> {
  const ticker = route.ticker?.toUpperCase();
  switch (route.tool) {
    case "propose_buy":
      return proposeBuy(settings, ticker ?? "NVDA", route.amount_usd ?? String(settings.min_order_usd));
    case "get_premium":
      return premiumCheck(settings, ticker ?? "NVDA");
    case "propose_rotation":
      return proposeRotation(settings, ticker);
    case "create_alert":
      return createAlertFromChat(message, settings, ticker);
    case "create_plan":
      return createPlanFromChat(message, settings, ticker);
    case "propose_setting_change":
      return proposeSettingsChange(settings, route.preset ?? "balanced");
  }
}

function llmUnavailableCard(reason: string): AgentChatResponse {
  return {
    ok: true,
    reply: "The conversational agent is unavailable right now, so I will not guess an answer.",
    disclaimer,
    tools: [],
    llm: { available: false, reason },
    card: {
      type: "general",
      title: "Conversational agent unavailable",
      summary: `${reason} Every tool below still runs without the model - use the quick actions.`,
      simulated: true,
      checks: [na("llm", "Language model reachable", "unavailable", "llm")],
      details: { reason },
      would_change_if: ["A valid OPENAI_API_KEY is configured on the server.", "The daily token budget resets."]
    }
  };
}

async function proposeBuy(settings: PivotSettings, ticker: string, amount: string): Promise<AgentChatResponse> {
  const snapshot = loadSampleSnapshot();
  const pair = pairFor(snapshot, ticker);
  if (!pair) {
    return {
      ok: true,
      reply: `I do not have a replay snapshot for ${ticker}.`,
      disclaimer,
      tools: ["propose_buy"],
      card: {
        type: "simulated_buy",
        title: "No simulated route",
        summary: `${ticker} is outside the current replay fixture.`,
        ticker,
        amount_usd: amount,
        simulated: true,
        checks: [na("coverage", "Ticker covered by replay", ticker, "fixture")],
        details: { replay: true },
        would_change_if: ["Part A provides a live snapshot containing this ticker."]
      }
    };
  }
  const token = cheaperIssuer(pair.a, pair.b);
  const reference = pair.reference?.price;
  const checks = [
    settings.allowed_issuers.includes(token.platform)
      ? pass("issuer", "Issuer allowed", token.platform, settings.allowed_issuers.join(","), "settings")
      : fail("issuer", "Issuer allowed", token.platform, settings.allowed_issuers.join(","), "settings"),
    Number(amount) >= settings.min_order_usd
      ? pass("min_order", "Minimum simulated order", `${amount} USD`, `>= ${settings.min_order_usd} USD`, "settings")
      : fail("min_order", "Minimum simulated order", `${amount} USD`, `>= ${settings.min_order_usd} USD`, "settings"),
    ...premiumChecks(token, settings, reference),
    await auditCheck(token, settings)
  ];
  const ok = checks.every((check) => check.status !== "fail");
  return {
    ok: true,
    reply: ok
      ? `Simulated buy draft: use ${token.platform} for ${ticker}; it is the cheaper issuer in replay.`
      : `I would not simulate-buy ${ticker} yet because one or more checks failed.`,
    disclaimer,
    tools: ["propose_buy", "get_premium", "settings.policy"],
    card: {
      type: "simulated_buy",
      title: `Simulated ${ticker} buy`,
      summary: `${token.platform} price/share ${token.price_per_share}; amount ${amount} USD. No signature, no broadcast.`,
      ticker,
      amount_usd: amount,
      simulated: true,
      checks,
      details: { selectedIssuer: token.platform, tokenAddress: token.address, replayTs: snapshot.ts, pair },
      would_change_if: ["Premium falls below your warning threshold.", "The other issuer becomes cheaper after quote costs.", "The agent is disabled in Settings."]
    }
  };
}

function premiumCheck(settings: PivotSettings, ticker: string): AgentChatResponse {
  const snapshot = loadSampleSnapshot();
  const pair = pairFor(snapshot, ticker);
  const token = pair ? cheaperIssuer(pair.a, pair.b) : null;
  const checks = token && pair ? premiumChecks(token, settings, pair.reference?.price) : [na("coverage", "Ticker covered by replay", ticker, "fixture")];
  return {
    ok: true,
    reply: token ? `Premium check for ${ticker}: ${checks.some((check) => check.status === "fail") ? "not attractive right now." : "within current settings."}` : `No replay premium data for ${ticker}.`,
    disclaimer,
    tools: ["get_premium"],
    card: {
      type: "premium_check",
      title: `${ticker} premium check`,
      summary: token ? `${token.platform} replay price/share ${token.price_per_share}; reference ${pair?.reference?.price ?? "missing"}.` : "No data.",
      simulated: true,
      ticker,
      checks,
      details: { source: "replay fixture", pair },
      would_change_if: ["Reference data becomes fresh and independent.", "Premium falls below your warning threshold."]
    }
  };
}

async function proposeRotation(settings: PivotSettings, requestedTicker?: string): Promise<AgentChatResponse> {
  const decision = await runAgentCycle({ snapshot: loadSampleSnapshot(), requestId: `chat-${Date.now()}` });
  const checks = [
    decision.outcome === "paper-filled"
      ? pass("simulation", "Paper simulation matches intent", decision.outcome, "paper-filled", "agent executor")
      : fail("simulation", "Paper simulation matches intent", decision.outcome, "paper-filled", "agent executor"),
    decision.violations.length === 0
      ? pass("guardrails", "Policy guardrails", "0 violations", "0", "agent policy")
      : fail("guardrails", "Policy guardrails", `${decision.violations.length} violations`, "0", "agent policy")
  ];
  const ticker = decision.opportunity?.ticker ?? requestedTicker ?? "the requested ticker";
  return {
    ok: true,
    reply: decision.outcome === "paper-filled" ? `Simulated rotation available for ${ticker}.` : `No safe rotation draft for ${ticker}.`,
    disclaimer,
    tools: ["propose_rotation", "paper_executor"],
    card: {
      type: "rotation",
      title: `Simulated ${ticker} rotation`,
      summary: decision.opportunity?.reason ?? "No opportunity passed policy.",
      simulated: true,
      ticker,
      checks,
      details: { decision },
      would_change_if: ["Net edge exceeds thresholds after route cost.", "Cooldown expires.", "Both issuers are open and pass audit."]
    }
  };
}

function createAlertFromChat(message: string, settings: PivotSettings, ticker?: string): AgentChatResponse {
  // The threshold still comes from the wording; the model only overrides which ticker it is about.
  const parsed = parseAlertDraft(message);
  const draft = createAlert(ticker ? { ...parsed, ticker } : parsed);
  return {
    ok: true,
    reply: `Alert draft created for ${draft.ticker}. It is simulated/in-app only.`,
    disclaimer,
    tools: ["create_alert"],
    card: {
      type: "alert_draft",
      title: `Alert: ${draft.ticker}`,
      summary: `${draft.type} ${draft.condition.op} ${draft.condition.value}`,
      ticker: draft.ticker,
      simulated: true,
      checks: [pass("agent_enabled", "Agent enabled", String(settings.agent_enabled), "true", "settings")],
      details: { alert: draft, alerts: listAlerts().length },
      would_change_if: ["Disable or edit the alert from the Alerts API/UI."]
    }
  };
}

function createPlanFromChat(message: string, settings: PivotSettings, ticker?: string): AgentChatResponse {
  const parsed = parsePlanDraft(message);
  const basket = ticker ? { ...parsed.basket!, tickers: [ticker] } : parsed.basket;
  const draft = createPlan({ ...parsed, basket });
  return {
    ok: true,
    reply: `Recurring plan draft created: ${draft.name}. It will only run in simulated mode.`,
    disclaimer,
    tools: ["create_plan"],
    card: {
      type: "plan_draft",
      title: draft.name,
      summary: `${draft.amount_usd} USD ${draft.frequency}; status ${draft.status}.`,
      amount_usd: draft.amount_usd,
      simulated: true,
      checks: [
        pass("agent_enabled", "Agent enabled", String(settings.agent_enabled), "true", "settings"),
        pass("confirm_mode", "User confirmation mode", settings.mode, "confirm", "settings")
      ],
      details: { plan: draft, plans: listPlans().length },
      would_change_if: ["User confirms the draft plan.", "Market is closed and skip_if_market_closed is enabled."]
    }
  };
}

function proposeSettingsChange(settings: PivotSettings, preset: "prudent" | "balanced" | "dynamic"): AgentChatResponse {
  // Computed, never written: a proposal must not touch stored settings or the change log.
  const proposed = previewPreset(settings, preset);
  return {
    ok: true,
    reply: `I can propose the ${preset} preset, but I did not apply it. Confirm it in Settings.`,
    disclaimer,
    tools: ["propose_setting_change"],
    card: {
      type: "settings_change",
      title: `Proposed ${preset} preset`,
      summary: "Draft only. The LLM never changes settings without user confirmation.",
      simulated: true,
      checks: [pass("confirmation", "Requires explicit confirmation", "draft", "confirmed", "settings policy")],
      details: { current: settings, proposed },
      would_change_if: ["User confirms the setting change."]
    }
  };
}

export function marketOverview() {
  const snapshot = loadSampleSnapshot();
  return {
    ok: true,
    replay: true,
    capturedAt: new Date(snapshot.ts * 1000).toISOString(),
    market: snapshot.market,
    heatmap: snapshot.pairs.map((pair) => ({
      ticker: pair.ticker,
      ondo: pair.a.platform === "ondo" ? pair.a.price_per_share : pair.b.price_per_share,
      bstock: pair.a.platform === "bstock" ? pair.a.price_per_share : pair.b.price_per_share,
      reference: pair.reference?.price ?? null,
      gross_spread_pct: pair.gross_spread_pct
    }))
  };
}

