import type { AgentIntent, AgentSnapshot } from "./types";

const actions = new Set(["rotate", "hold", "derisk", "reenter"]);
const platforms = new Set(["ondo", "bstock"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d+(\.\d+)?$/.test(value);
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function validateSnapshotShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["snapshot must be an object"];
  if (typeof value.ts !== "number") errors.push("snapshot.ts must be a number");
  if (value.mode !== "paper" && value.mode !== "live") errors.push("snapshot.mode must be paper or live");
  if (!isRecord(value.market)) errors.push("snapshot.market must be an object");
  if (!Array.isArray(value.pairs)) errors.push("snapshot.pairs must be an array");
  for (const [index, pair] of (Array.isArray(value.pairs) ? value.pairs : []).entries()) {
    if (!isRecord(pair)) {
      errors.push(`pairs[${index}] must be an object`);
      continue;
    }
    if (typeof pair.ticker !== "string" || !pair.ticker) errors.push(`pairs[${index}].ticker missing`);
    if (pair.chain !== "56") errors.push(`pairs[${index}].chain must be 56 for this branch`);
    for (const side of ["a", "b"] as const) {
      const token = pair[side];
      if (!isRecord(token)) {
        errors.push(`pairs[${index}].${side} must be an object`);
        continue;
      }
      if (!platforms.has(String(token.platform))) errors.push(`pairs[${index}].${side}.platform invalid`);
      if (!isAddress(token.address)) errors.push(`pairs[${index}].${side}.address invalid`);
      if (!isDecimalString(token.price_per_share)) errors.push(`pairs[${index}].${side}.price_per_share invalid`);
      if (typeof token.price_age_s !== "number") errors.push(`pairs[${index}].${side}.price_age_s invalid`);
      if (!isDecimalString(token.liquidity_usd)) errors.push(`pairs[${index}].${side}.liquidity_usd invalid`);
    }
  }
  return errors;
}

export function assertSnapshot(value: unknown): AgentSnapshot {
  const errors = validateSnapshotShape(value);
  if (errors.length) throw new Error(`Invalid agent snapshot: ${errors.join("; ")}`);
  return value as AgentSnapshot;
}

export function validateIntentShape(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["intent must be an object"];
  if (!actions.has(String(value.action))) errors.push("intent.action invalid");
  if (!isDecimalString(value.size_usd)) errors.push("intent.size_usd must be a decimal string");
  if (!isDecimalString(value.max_slippage_pct)) errors.push("intent.max_slippage_pct must be a decimal string");
  if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
    errors.push("intent.confidence must be between 0 and 1");
  }
  if (typeof value.rationale !== "string" || value.rationale.length > 500) errors.push("intent.rationale invalid");
  if (value.action === "rotate") {
    for (const key of ["from_token", "to_token"] as const) {
      const token = value[key];
      if (!isRecord(token)) {
        errors.push(`intent.${key} missing`);
        continue;
      }
      if (token.chain !== "56") errors.push(`intent.${key}.chain must be 56`);
      if (!isAddress(token.address)) errors.push(`intent.${key}.address invalid`);
      if (!platforms.has(String(token.platform))) errors.push(`intent.${key}.platform invalid`);
    }
  }
  return errors;
}

export function assertIntent(value: unknown): AgentIntent {
  const errors = validateIntentShape(value);
  if (errors.length) throw new Error(`Invalid agent intent: ${errors.join("; ")}`);
  return value as AgentIntent;
}

