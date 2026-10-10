import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAlert, listAlerts, testAlert } from "./agent/alerts";
import { handleAgentChat } from "./agent/chatTools";
import { createPlan, runPlan } from "./agent/plans";
import { readSettings, setAgentEnabled, updateSettings } from "./agent/settings";

const tmp = path.join(os.tmpdir(), `circuitstock-agent-pivot-${process.pid}`);
process.env.AGENT_SETTINGS_PATH = path.join(tmp, "settings.json");
process.env.AGENT_SETTINGS_CHANGES_PATH = path.join(tmp, "settings-changes.jsonl");
process.env.AGENT_ALERTS_PATH = path.join(tmp, "alerts.json");
process.env.AGENT_ALERT_TRIGGERS_PATH = path.join(tmp, "alert-triggers.jsonl");
process.env.AGENT_PLANS_PATH = path.join(tmp, "plans.json");

test("global agent kill switch blocks chat actions", async () => {
  setAgentEnabled(false, "test");
  const response = await handleAgentChat("buy 50 USD of AAPL");
  assert.equal(response.card.type, "disabled");
  assert.equal(response.card.checks[0].status, "fail");
  setAgentEnabled(true, "test");
});

test("chat propose buy returns a structured simulated card with checks", async () => {
  updateSettings({ agent_enabled: true, min_order_usd: 20, premium_warn_pct: 2 }, "test");
  const response = await handleAgentChat("buy 50 USD of AAPL");
  assert.equal(response.card.type, "simulated_buy");
  assert.equal(response.card.simulated, true);
  assert.equal(response.card.checks.length > 0, true);
  assert.equal(response.disclaimer.includes("not financial advice"), true);
});

test("settings persist and expose user source of truth", () => {
  const settings = updateSettings({ preset: "prudent" }, "test");
  assert.equal(settings.preset, "prudent");
  assert.equal(readSettings().preset, "prudent");
});

test("alerts can be created and manually test-triggered", () => {
  const alert = createAlert({ ticker: "NVDA", condition: { op: "<", value: "0.3" } });
  assert.equal(listAlerts().some((item) => item.id === alert.id), true);
  const trigger = testAlert(alert.id);
  assert.equal(trigger.test, true);
});

test("plans can be drafted and run in simulated mode", () => {
  const plan = createPlan({ name: "NVDA weekly", amount_usd: "50" });
  const result = runPlan(plan.id);
  assert.equal(result.simulated, true);
  assert.equal(result.plan.last_run_at !== undefined, true);
});
