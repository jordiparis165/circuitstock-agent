import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";

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

function plansPath(): string {
  return path.resolve(process.cwd(), pickEnv(["AGENT_PLANS_PATH"]) ?? "data/agent-plans.json");
}

function readJson<T>(target: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function savePlans(plans: Plan[]): void {
  fs.mkdirSync(path.dirname(plansPath()), { recursive: true });
  fs.writeFileSync(plansPath(), JSON.stringify(plans, null, 2));
}

export function listPlans(): Plan[] {
  return readJson<Plan[]>(plansPath(), []);
}

export function createPlan(input: Partial<Plan>): Plan {
  const plan: Plan = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name ?? "Simulated recurring plan",
    amount_usd: String(input.amount_usd ?? "50"),
    frequency: input.frequency ?? "weekly",
    schedule: input.schedule ?? "monday",
    basket: input.basket ?? { mode: "tickers", tickers: ["NVDA"], weights: "equal" },
    constraints: input.constraints ?? { issuer: "cheapest", max_premium_pct: "0.5", skip_if_market_closed: true },
    status: input.status ?? "draft",
    created_at: new Date().toISOString()
  };
  savePlans([...listPlans(), plan]);
  return plan;
}

export function patchPlan(id: string, patch: Partial<Plan>): Plan | null {
  const plans = listPlans();
  const index = plans.findIndex((plan) => plan.id === id);
  if (index === -1) return null;
  plans[index] = { ...plans[index], ...patch, id };
  savePlans(plans);
  return plans[index];
}

export function deletePlan(id: string): boolean {
  const plans = listPlans();
  const next = plans.filter((plan) => plan.id !== id);
  savePlans(next);
  return next.length !== plans.length;
}

export function runPlan(id: string): { plan: Plan; simulated: true; message: string } {
  const plan = patchPlan(id, { last_run_at: new Date().toISOString() });
  if (!plan) throw new Error("Plan not found.");
  return { plan, simulated: true, message: `Simulated ${plan.amount_usd} USD plan run for ${plan.name}. No transaction was signed or broadcast.` };
}

export function parsePlanDraft(text: string): Partial<Plan> {
  const amount = text.match(/(\d+(?:[.,]\d+)?)\s*(?:\$|usd|eur|€)?/i)?.[1]?.replace(",", ".") ?? "50";
  const tickers = [...text.matchAll(/\b[A-Z]{2,5}\b/g)].map((match) => match[0]).filter((ticker) => !["USD", "EUR"].includes(ticker));
  const frequency = /month|mensuel/i.test(text) ? "monthly" : /day|jour/i.test(text) ? "daily" : "weekly";
  return {
    name: `Simulated ${frequency} plan`,
    amount_usd: amount,
    frequency,
    schedule: frequency === "weekly" ? "monday" : "next-open",
    basket: { mode: "tickers", tickers: tickers.length ? tickers : ["NVDA"], weights: "equal" }
  };
}

