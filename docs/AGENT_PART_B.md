# Agent Part B

Implementation branch: `feat/agent-ia`.

The source handoff was provided as `H:\Downloads\AGENT_PART_B_HANDOFF.md`. The implementation keeps the new agent code isolated under `server/agent/`.

## Current Scope

- Paper mode by default.
- Deterministic mock LLM client for tests and demos.
- Snapshot contract fixture in `fixtures/snapshot.sample.json`.
- S1 cross-issuer rotation on a supplied snapshot.
- S2 market-state gating: hold/derisk/reenter/rotate.
- Code guardrails for kill switch, whitelist, stale data, liquidity, notional caps, slippage, cooldown, one in-flight order per pair, Ondo minimum size, and stablecoin selection rule.
- Paper execution adapter with deterministic quote/simulate preview, `quoteId`, route, price impact, gas, and balance changes.
- Simulation-vs-intent comparison: a rotation is rejected if the simulated balance changes do not spend the expected source token and receive the expected target token for the intended size.
- Ledger for explainable decisions.
- Pivot endpoints: `POST /api/agent/chat`, `GET|PUT /api/settings`, `POST /api/settings/kill`, alert/plan CRUD, `GET /api/market/overview`, `GET /api/skills/log`.
- Wallet Skills clients are read-only and logged under `server/skills/`; `scripts/check_skills.mjs` calls the public skill-check endpoint.

No transaction signing or broadcasting is implemented in this branch.
