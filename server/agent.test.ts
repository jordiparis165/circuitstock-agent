import assert from "node:assert/strict";
import test from "node:test";
import { loadSampleSnapshot } from "./agent/fixtures";
import { validateIntent } from "./agent/guardrails";
import { runAgentCycle } from "./agent/runner";
import type { AgentIntent } from "./agent/types";

test("paper agent rotates from expensive issuer to cheaper issuer when guardrails pass", async () => {
  process.env.TRADING_MODE = "paper";
  process.env.AGENT_MAX_TRADE_USD = "25";
  process.env.AGENT_MIN_NET_EDGE_PCT = "0.20";
  process.env.AGENT_MIN_LIQUIDITY_USD = "100000";
  process.env.AGENT_MAX_PRICE_AGE_SEC = "120";
  process.env.AGENT_TOKEN_WHITELIST = "0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222";

  const decision = await runAgentCycle({ snapshot: loadSampleSnapshot() });
  assert.equal(decision.outcome, "paper-filled");
  assert.equal(decision.intent.action, "rotate");
  assert.equal(decision.intent.from_token?.platform, "bstock");
  assert.equal(decision.intent.to_token?.platform, "ondo");
  assert.equal(decision.violations.length, 0);
  assert.equal(decision.paperSimulation?.status, "SUCCESS");
});

test("guardrails reject stale data", () => {
  process.env.TRADING_MODE = "paper";
  process.env.AGENT_MAX_PRICE_AGE_SEC = "10";
  const snapshot = loadSampleSnapshot();
  const intent: AgentIntent = {
    action: "rotate",
    from_token: { chain: "56", address: snapshot.pairs[0].b.address, platform: "bstock" },
    to_token: { chain: "56", address: snapshot.pairs[0].a.address, platform: "ondo" },
    size_usd: "25",
    max_slippage_pct: "0.50",
    confidence: 0.7,
    rationale: "test"
  };
  const violations = validateIntent(intent, { snapshot });
  assert.equal(violations.some((item) => item.includes("stale")), true);
});

test("guardrails reject Ondo below minimum notional", () => {
  process.env.TRADING_MODE = "paper";
  process.env.AGENT_MAX_PRICE_AGE_SEC = "120";
  process.env.AGENT_ONDO_MIN_USD = "20";
  const snapshot = loadSampleSnapshot();
  const intent: AgentIntent = {
    action: "rotate",
    from_token: { chain: "56", address: snapshot.pairs[0].b.address, platform: "bstock" },
    to_token: { chain: "56", address: snapshot.pairs[0].a.address, platform: "ondo" },
    size_usd: "10",
    max_slippage_pct: "0.50",
    confidence: 0.7,
    rationale: "test"
  };
  const violations = validateIntent(intent, { snapshot });
  assert.equal(violations.some((item) => item.includes("Ondo minimum")), true);
});

