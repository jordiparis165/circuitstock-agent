import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";

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

export const defaultSettings: PivotSettings = {
  agent_enabled: true,
  mode: "confirm",
  max_order_usd: 500,
  min_order_usd: 20,
  daily_cap_usd: 2000,
  premium_noise_pct: 0.15,
  premium_warn_pct: 0.5,
  rotation_k: 3,
  rotation_min_gain_usd: 1,
  rotation_cooldown_h: 24,
  max_route_cost_pct: 1.0,
  allowed_issuers: ["ondo", "bstock"],
  allowed_sectors: [],
  allowed_tickers: [],
  require_audit: true,
  audit_block_level: "HIGH",
  use_news: true,
  notifications: { in_app: true, browser: true },
  preset: "balanced"
};

const presetValues: Record<AgentPreset, Partial<PivotSettings>> = {
  prudent: {
    max_order_usd: 100,
    daily_cap_usd: 500,
    premium_warn_pct: 0.35,
    rotation_k: 4,
    rotation_min_gain_usd: 2,
    max_route_cost_pct: 0.6,
    audit_block_level: "MEDIUM"
  },
  balanced: {},
  dynamic: {
    max_order_usd: 1000,
    daily_cap_usd: 4000,
    premium_warn_pct: 0.75,
    rotation_k: 2,
    rotation_min_gain_usd: 0.5,
    max_route_cost_pct: 1.25
  }
};

function settingsPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_SETTINGS_PATH"]) ?? "data/agent-settings.json");
}

function changesPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_SETTINGS_CHANGES_PATH"]) ?? "data/agent-settings-changes.jsonl");
}

function readJson<T>(target: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function readSettings(): PivotSettings {
  const saved = readJson<Partial<PivotSettings>>(settingsPath(), {});
  return { ...defaultSettings, ...saved, notifications: { ...defaultSettings.notifications, ...saved.notifications } };
}

export function resetSettings(preset: AgentPreset = "balanced", actor = "user"): PivotSettings {
  const next = { ...defaultSettings, ...presetValues[preset], preset };
  writeSettings(next, actor);
  return next;
}

function writeSettings(settings: PivotSettings, actor: string, previous = readSettings()): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  const changes: SettingsChange[] = [];
  for (const key of Object.keys(settings) as Array<keyof PivotSettings>) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(settings[key])) {
      changes.push({ at: new Date().toISOString(), actor, key, oldValue: previous[key], newValue: settings[key] });
    }
  }
  if (changes.length) {
    fs.mkdirSync(path.dirname(changesPath()), { recursive: true });
    fs.appendFileSync(changesPath(), changes.map((change) => JSON.stringify(change)).join("\n") + "\n");
  }
}

export function updateSettings(patch: Partial<PivotSettings>, actor = "user"): PivotSettings {
  const current = readSettings();
  const next: PivotSettings = {
    ...current,
    ...patch,
    notifications: { ...current.notifications, ...patch.notifications }
  };
  if (patch.preset && presetValues[patch.preset]) Object.assign(next, presetValues[patch.preset], { preset: patch.preset });
  next.max_order_usd = Math.max(1, Number(next.max_order_usd));
  next.min_order_usd = Math.max(1, Number(next.min_order_usd));
  next.daily_cap_usd = Math.max(next.max_order_usd, Number(next.daily_cap_usd));
  next.allowed_issuers = next.allowed_issuers.filter((issuer) => issuer === "ondo" || issuer === "bstock");
  writeSettings(next, actor, current);
  return next;
}

export function setAgentEnabled(enabled: boolean, actor = "user"): PivotSettings {
  return updateSettings({ agent_enabled: enabled }, actor);
}

export function recentSettingsChanges(limit = 25): SettingsChange[] {
  try {
    return fs
      .readFileSync(changesPath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SettingsChange)
      .slice(-limit)
      .reverse();
  } catch {
    return [];
  }
}

