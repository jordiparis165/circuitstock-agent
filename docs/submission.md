# Submission Notes

## Project

CircuitStock Agent

## Short Description

CircuitStock turns tokenized stocks on BSC into a judge-friendly agent workflow. It scans bStocks/Ondo prices, ranks spreads, explains risks, prepares quote/approval/swap/simulation evidence, and exposes an AI-agent interface for prompts, alerts, plans and risk settings. It is intentionally no-broadcast: every execution path stops before a user-controlled wallet signature.

## Tracks And Prize Fit

- Tokenized stocks: live RWA scanner, bStocks/Ondo filters and stock-first UX.
- Binance Web3 API depth: RWA, Market, Trading, Transaction, Wallet and evidence endpoints.
- Agentic Wallet / Wallet Skills: compact agent payloads, conversational `/api/agent/chat`, read-only skills log and no-broadcast transaction boundary.
- BNB Agent Studio direction: settings, guardrails, alerts, recurring plan drafts, dry-run watcher and kill switch.
- Developer Experience: documented integration lessons, smoke endpoints, reproducible tests and clear limitations.

## APIs Used

- `GET /api/v1/dex/market/rwa/tokens`
- `GET /api/v1/dex/market/rwa/platforms`
- `GET /api/v1/dex/market/rwa/search`
- `GET /api/v1/dex/market/rwa/underlying-profile`
- `GET /api/v1/dex/market/rwa/underlying-market`
- `GET /api/v1/dex/market/candles`
- `GET /api/v1/dex/aggregator/quote`
- `GET /api/v1/dex/aggregator/approve-transaction`
- `GET /api/v1/dex/aggregator/swap`
- `GET /api/v1/dex/pre-transaction/gas-price`
- `POST /api/v1/dex/pre-transaction/gas-limit`
- `POST /api/v1/dex/pre-transaction/simulate`
- `GET /api/v1/dex/balance/all-token-balances-by-address`
- `GET /api/v1/dex/market/portfolio/overview`

## Judge Checklist

- `GET /api/health`: confirms server config without exposing secrets.
- `GET /api/evidence`: sanitized Binance module calls and latency.
- `GET /api/market`: RWA scanner with cache status.
- `POST /api/execution/prepare`: quote, approval payload, swap payload, gas checks and simulation.
- `POST /api/agent/recommend/compact`: short agent-ready recommendation.
- `POST /api/agent/chat`: conversational buy, premium check, alert, plan and settings drafts.
- `GET|PUT /api/settings`: agent risk/guardrail settings.
- `GET /api/skills/check`: Wallet Skills availability check with failures shown honestly.
- `GET /api/judge/smoke`: one-call readiness proof.
- `npm run build` and `npm run test -- --run`: local verification.

## Agent Skills Shape

### `scan_tokenized_stock_spreads`

Scans selected bStocks/Ondo platforms and returns ranked opportunities with spread, liquidity, action, reason, score and cache status.

### `prepare_rebalance`

Returns quote, official approval transaction, swap calldata, gas checks, wallet snapshot, simulation summary and required user action. It never broadcasts.

### `plain_language_stock_prompt`

Turns prompts such as `buy 50 USD of AAPL` into a simulated agent card with checks and explanations.

### `draft_alert`

Creates an in-app alert draft from prompts such as `préviens moi quand NVDA est sous la prime 0.2`.

### `draft_recurring_plan`

Creates a simulated plan draft. The plan does not execute real transactions.

### `risk_settings_guardrail`

Reads or proposes settings such as preset, max order, allowed issuers and kill switch state. Changes require explicit confirmation.

## Known Limitations

- Conversational agent actions are simulated/dry-run for safety.
- OpenAI reasoning is optional and requires `OPENAI_API_KEY`; fallback stays deterministic.
- Independent stock reference needs Alpaca/Finnhub keys plus a populated universe file. Without those, fallback/cached status is explicit.
- Wallet `eth_signTransaction` support varies by browser wallet. The app keeps payloads inspectable when signing is unavailable.
- Render free tier can cold-start.

## Final Form Text

CircuitStock is an agentic tokenized-stocks cockpit for BSC. It combines live Binance Web3 RWA data, Trading API quotes, official approval/swap calldata, gas checks and transaction simulation with an AI-agent layer for recommendations, alerts, recurring plans and guardrails. The product is intentionally safe: no backend or frontend path broadcasts transactions. Judges can verify the full flow through the live dashboard, Agent Studio, `/api/judge/smoke`, and the documented demo script.
