# DX Report Notes

These are factual notes for the human DX report, not the report itself.

- 2026-10-08: Agent Part B handoff references `CLAUDE.md`, `docs/binance-web3-context.md`, `docs/arbitrage-and-data-fetching.md`, `docs/agent-design.md`, and `docs/hackathon-brief.md`, but those files are not present in the current repo. Used existing README, submission docs, server Binance client, reference-price code, and spread/policy tests as the available source of truth.
- 2026-10-08: `prepareExecution()` still routes through `quoteTokens.usdc` for both bStocks and Ondo. The handoff says Ondo on BSC must use USDT; this should be fixed in a separate coordinated commit because it touches shared execution code owned by Part A.

