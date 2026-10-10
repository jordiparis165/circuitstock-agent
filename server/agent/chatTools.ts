import { createAlert, listAlerts, parseAlertDraft } from "./alerts";
import { loadSampleSnapshot } from "./fixtures";
import { createPlan, listPlans, parsePlanDraft } from "./plans";
import { runAgentCycle } from "./runner";
import { readSettings, updateSettings, type PivotSettings } from "./settings";
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

function parseTicker(text: string, fallback = "NVDA"): string {
  const ignored = new Set([
    "USD",
    "USDT",
    "USDC",
    "EUR",
    "BUY",
    "OF",
    "DE",
    "DU",
    "THE",
    "MOI",
    "SOUS",
    "QUAND",
    "PRIME",
    "PREMIUM",
    "ACHETE",
    "ACHETER",
    "ALERTE",
    "PLAN"
  ]);
  const match = [...text.matchAll(/\b[A-Z]{2,5}\b/gi)]
    .map((item) => item[0].toUpperCase())
    .find((item) => !ignored.has(item));
  return match ?? fallback;
}

function parseAmount(text: string, fallback = "50"): string {
  return text.match(/(\d+(?:[.,]\d+)?)\s*(?:\$|usd|usdt|usdc|€|eur)?/i)?.[1]?.replace(",", ".") ?? fallback;
}

function pairFor(snapshot: AgentSnapshot, ticker: string) {
  return snapshot.pairs.find((pair) => pair.ticker.toUpperCase() === ticker.toUpperCase());
}

function cheaperIssuer(a: SnapshotToken, b: SnapshotToken): SnapshotToken {
  return Number(a.price_per_share) <= Number(b.price_per_share) ? a : b;
}

function premiumChecks(token: SnapshotToken, settings: PivotSettings, referencePrice?: string): AgentCheck[] {
  if (!referencePrice) return [na("reference", "Independent reference price", "missing", "fixture")];
  const premiumPct = ((Number(token.price_per_share) - Number(referencePrice)) / Number(referencePrice)) * 100;
  return [
    Math.abs(premiumPct) <= settings.premium_warn_pct
      ? pass("premium", "Premium below warning threshold", `${premiumPct.toFixed(3)}%`, `<= ${settings.premium_warn_pct}%`, "snapshot/reference")
      : fail("premium", "Premium below warning threshold", `${premiumPct.toFixed(3)}%`, `<= ${settings.premium_warn_pct}%`, "snapshot/reference"),
    token.price_age_s <= 120
      ? pass("age", "Token price freshness", `${token.price_age_s}s`, "<= 120s", "snapshot", token.price_age_s)
      : fail("age", "Token price freshness", `${token.price_age_s}s`, "<= 120s", "snapshot", token.price_age_s)
  ];
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

export async function handleAgentChat(message: string): Promise<AgentChatResponse> {
  const settings = readSettings();
  const normalized = message.toLowerCase();
  if (!settings.agent_enabled) return disabledCard(settings);

  if (/alert|alerte|pr[eé]viens|previens|previen|notify|when|quand/i.test(message)) return createAlertFromChat(message, settings);
  if (/plan|weekly|monthly|semaine|mensuel|récurrent|recurrent/i.test(message)) return createPlanFromChat(message, settings);
  if (/setting|réglage|reglage|risk|prudent|dynamic|dynamique|balanced|équilibré|equilibre/i.test(message)) {
    return proposeSettingsChange(message, settings);
  }
  if (/rotation|rotate|swap|issuer|émetteur|emetteur/i.test(message)) return proposeRotationFromChat(message, settings);
  if (/premium|prime|cher|intéressant|interessant|moment/i.test(message)) return premiumFromChat(message, settings);
  return proposeBuyFromChat(message, settings);
}

function proposeBuyFromChat(message: string, settings: PivotSettings): AgentChatResponse {
  const snapshot = loadSampleSnapshot();
  const ticker = parseTicker(message);
  const amount = parseAmount(message, String(settings.min_order_usd));
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
    ...premiumChecks(token, settings, reference)
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

function premiumFromChat(message: string, settings: PivotSettings): AgentChatResponse {
  const snapshot = loadSampleSnapshot();
  const ticker = parseTicker(message);
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

async function proposeRotationFromChat(message: string, settings: PivotSettings): Promise<AgentChatResponse> {
  const decision = await runAgentCycle({ snapshot: loadSampleSnapshot(), requestId: `chat-${Date.now()}` });
  const checks = [
    decision.outcome === "paper-filled"
      ? pass("simulation", "Paper simulation matches intent", decision.outcome, "paper-filled", "agent executor")
      : fail("simulation", "Paper simulation matches intent", decision.outcome, "paper-filled", "agent executor"),
    decision.violations.length === 0
      ? pass("guardrails", "Policy guardrails", "0 violations", "0", "agent policy")
      : fail("guardrails", "Policy guardrails", `${decision.violations.length} violations`, "0", "agent policy")
  ];
  const ticker = decision.opportunity?.ticker ?? parseTicker(message);
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

function createAlertFromChat(message: string, settings: PivotSettings): AgentChatResponse {
  const draft = createAlert(parseAlertDraft(message));
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

function createPlanFromChat(message: string, settings: PivotSettings): AgentChatResponse {
  const draft = createPlan(parsePlanDraft(message));
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

function proposeSettingsChange(message: string, settings: PivotSettings): AgentChatResponse {
  const preset = /prudent/i.test(message) ? "prudent" : /dynamic|dynamique/i.test(message) ? "dynamic" : "balanced";
  const proposed = updateSettings({ preset }, "agent-proposal");
  updateSettings(settings, "agent-proposal-rollback");
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

