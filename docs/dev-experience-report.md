# Developer Experience Report

## Summary

CircuitStock integrates Binance Web3 APIs for the BNB Hack: Tokenized Stocks Edition. The final product is a dashboard plus AI-agent layer for tokenized stocks on BSC:

1. Scan bStocks/Ondo tokenized-stock data.
2. Rank on-chain/reference spreads.
3. Explain opportunities and risk checks.
4. Prepare quote, approval calldata, swap calldata, gas checks and simulation.
5. Let the user wallet sign if supported.
6. Never broadcast automatically.

The agent layer adds prompts, simulated buy cards, premium checks, alert drafts, plan drafts, settings proposals, dry-run watcher policy and Wallet Skills evidence.

## What Is Real

- Server-side Binance Web3 signed request client.
- RWA scanner with `live`, `cached` and `fallback` status.
- Trading API quote and swap-build path.
- Official approval transaction extraction.
- Gas price, gas limit and simulation calls.
- Wallet balance/portfolio checks where Binance endpoints are available.
- BSC RPC readiness check.
- Agent settings, alerts and plans persisted under `data/`.
- Wallet Skills read-only checks and `/api/skills/log`.
- Local tests for policy, spreads, reference selection and Part B agent behavior.

## What Is Simulated Or Optional

- Conversational buy/alert/plan cards are simulated by design.
- The watcher is dry-run and refuses real live execution because no Agentic Wallet executor is wired.
- OpenAI reasoning is optional. If `OPENAI_API_KEY` is absent, deterministic fallback is used.
- Independent reference pricing requires Alpaca/Finnhub credentials and a populated `config/universe.json`.
- Replay snapshots are demo fixtures for cross-issuer agent behavior, not proof of live fillable arbitrage.

## Integration Notes

- Base URL: `https://web3.binance.com/build`.
- The signed path must include `/build`; signing only `/api/v1/...` produces signature failures.
- Signed headers: `X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`.
- Signature: Base64 HMAC-SHA256 over `timestamp + method + requestPath + body`.
- Both `GET` and `POST` signing are required.
- Quote IDs expire quickly, so swap calldata is built immediately and quote-expired errors are normalized.
- Approval/swap responses can nest EVM transaction fields under different shapes; extraction must be defensive.
- Simulation can return HTTP success while the simulated EVM execution fails. The UI must read nested execution status and display a human reason.
- `eth_signTransaction` is not consistently supported by injected wallets. CircuitStock therefore keeps payloads visible/copyable and labels the failed signature attempt clearly.
- Wallet Skills endpoints can fail from region, headers or endpoint changes. Failures are logged instead of hidden.

## Product Decisions

- Default demo amount is small (`$10` to `$50` depending on flow).
- BSC mainnet only.
- Spot only.
- No broadcast path.
- Dashboard-first UX, no marketing landing page.
- Agent cards show checks, sources, thresholds and "would change if" conditions.
- Risk rules are explicit: kill switch, whitelist, max trade, daily budget, slippage, cooldown and simulation gate.

## Final API Surface

- `GET /api/health`
- `GET /api/evidence`
- `GET /api/market`
- `POST /api/execution/prepare`
- `POST /api/agent/recommend`
- `POST /api/agent/recommend/compact`
- `POST /api/agent/chat`
- `GET|PUT /api/settings`
- `POST /api/settings/kill`
- `GET /api/market/overview`
- `GET /api/portfolio`
- `GET|POST|PATCH|DELETE /api/alerts`
- `GET|POST|PATCH|DELETE /api/plans`
- `GET /api/opportunities`
- `GET /api/skills/log`
- `GET /api/skills/check`
- `GET /api/judge/readiness`
- `GET /api/judge/smoke`

## Lessons For Binance

- A TypeScript SDK for signed Web3 API requests would remove the most error-prone integration step.
- RWA docs should explicitly distinguish exchange-derived reference prices from independent equity-market references.
- Quote expiry and response shapes should be documented with exact examples.
- Wallet Skills documentation would benefit from a tokenized-stock sample that includes "prepare but do not broadcast".
- Rate-limit headers and retry guidance would make production caching cleaner.

## Verification Snapshot

Local:

```bash
npm run build
npm run test -- --run
```

Production:

```text
GET https://circuitstock-agent-api.onrender.com/api/health
GET https://circuitstock-agent-api.onrender.com/api/judge/smoke
POST https://circuitstock-agent-api.onrender.com/api/agent/chat
```
