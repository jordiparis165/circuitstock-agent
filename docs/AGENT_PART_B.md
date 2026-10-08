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
- Ledger for explainable decisions.

No transaction signing or broadcasting is implemented in this branch.

