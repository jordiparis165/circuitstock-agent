import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";

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

function alertsPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_ALERTS_PATH"]) ?? "data/agent-alerts.json");
}

function triggersPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_ALERT_TRIGGERS_PATH"]) ?? "data/agent-alert-triggers.jsonl");
}

function readJson<T>(target: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function saveAlerts(alerts: AlertRule[]): void {
  fs.mkdirSync(path.dirname(alertsPath()), { recursive: true });
  fs.writeFileSync(alertsPath(), JSON.stringify(alerts, null, 2));
}

export function listAlerts(): AlertRule[] {
  return readJson<AlertRule[]>(alertsPath(), []);
}

export function createAlert(input: Partial<AlertRule>): AlertRule {
  const alert: AlertRule = {
    id: input.id ?? crypto.randomUUID(),
    type: input.type ?? "premium",
    ticker: String(input.ticker ?? "").toUpperCase(),
    issuer: input.issuer,
    condition: input.condition ?? { op: "<", value: "0.3" },
    cooldown_s: Number(input.cooldown_s ?? 3600),
    channels: input.channels ?? ["in_app", "browser"],
    enabled: input.enabled ?? true,
    created_at: new Date().toISOString()
  };
  if (!alert.ticker) throw new Error("Alert ticker is required.");
  const alerts = [...listAlerts(), alert];
  saveAlerts(alerts);
  return alert;
}

export function patchAlert(id: string, patch: Partial<AlertRule>): AlertRule | null {
  const alerts = listAlerts();
  const index = alerts.findIndex((alert) => alert.id === id);
  if (index === -1) return null;
  alerts[index] = { ...alerts[index], ...patch, id };
  saveAlerts(alerts);
  return alerts[index];
}

export function deleteAlert(id: string): boolean {
  const alerts = listAlerts();
  const next = alerts.filter((alert) => alert.id !== id);
  saveAlerts(next);
  return next.length !== alerts.length;
}

export function testAlert(id: string): AlertTrigger {
  const alert = listAlerts().find((item) => item.id === id);
  if (!alert) throw new Error("Alert not found.");
  const trigger = {
    id: crypto.randomUUID(),
    alertId: id,
    at: new Date().toISOString(),
    test: true,
    message: `Test alert for ${alert.ticker}: ${alert.type} ${alert.condition.op} ${alert.condition.value}`
  };
  fs.mkdirSync(path.dirname(triggersPath()), { recursive: true });
  fs.appendFileSync(triggersPath(), `${JSON.stringify(trigger)}\n`);
  return trigger;
}

export function parseAlertDraft(text: string): Partial<AlertRule> {
  const ignored = new Set(["MOI", "SOUS", "QUAND", "PRIME", "PREMIUM", "PREVIENS", "ALERTE", "USD", "EUR", "LA", "LE", "DE", "DU", "DES"]);
  const ticker =
    [...text.matchAll(/\b[A-Z]{2,5}\b/gi)]
      .map((match) => match[0].toUpperCase())
      .find((item) => !ignored.has(item)) ?? "NVDA";
  const value = text.match(/(\d+(?:[.,]\d+)?)\s*%?/)?.[1]?.replace(",", ".") ?? "0.3";
  const op = /above|sup|plus|>/i.test(text) ? ">" : "<";
  return { type: "premium", ticker, condition: { op, value }, cooldown_s: 3600, channels: ["in_app", "browser"], enabled: true };
}

