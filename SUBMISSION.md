# CircuitStock Agent - Final Submission

## Links

- Live demo: https://circuitstock-agent.vercel.app
- API: https://circuitstock-agent-api.onrender.com
- Repository: https://github.com/jordiparis165/circuitstock-agent
- Demo video: add the recorded link after following `docs/demo-script.md`

## One-Liner

CircuitStock is an agentic BSC tokenized-stocks cockpit: it scans bStocks/Ondo spreads, explains the opportunity, prepares quote/approval/swap/simulation evidence, and exposes an AI-agent layer that can advise, draft alerts/plans and enforce risk rules without ever broadcasting a transaction.

## What To Show Judges

1. Open the live app and start on **Monitor**.
2. Show live or cached Binance Web3 RWA market data, platform filters, spread ranking and API evidence.
3. Open **Agent Studio** and ask: `buy 50 USD of AAPL`.
4. Show the simulated agent card: checks, issuer choice, risk settings, no signature and no broadcast.
5. Ask: `préviens moi quand NVDA est sous la prime 0.2`.
6. Show the alert draft and explain it is in-app/simulated until the user confirms real automation.
7. Open **Risk Rules** / Agent settings and show the kill switch, allowed symbols, max trade, max daily budget, slippage and cooldown.
8. Run **Judge Mode** smoke checks.
9. Optionally connect a wallet on BSC and show approval/swap payloads. Signing is wallet-side only; CircuitStock never sends a transaction.

## Technical Highlights

- Binance Web3 signed API client with server-side secrets only.
- RWA scanner using bStocks/Ondo data and cache status labels: `live`, `cached`, `fallback`.
- Trading path: quote, official approval payload, swap calldata, gas checks and pre-transaction simulation.
- Agent path: `/api/agent/chat`, `/api/settings`, `/api/alerts`, `/api/plans`, `/api/market/overview`, `/api/skills/check`.
- Safety path: dry-run watcher, kill switch, explicit whitelist, daily budget, cooldown, slippage limit, simulation gate and no broadcast.
- Wallet Skills proof: read-only Binance skill clients with a public `/api/skills/log` and `/api/skills/check`.
- Judge evidence: `/api/health`, `/api/evidence`, `/api/judge/readiness`, `/api/judge/smoke`.

## Honest Scope

- Real: Binance Web3 integration, live RWA scanner, quote/build/simulate path, wallet-side signing boundary, settings, alerts/plans storage, skills logging and tests.
- Simulated: conversational portfolio actions, recurring plans, alerts and autonomous watcher execution.
- Optional: OpenAI reasoning only activates if `OPENAI_API_KEY` is configured; otherwise the app uses deterministic fallback.
- Independent reference layer needs Alpaca/Finnhub keys and a populated `config/universe.json`; without them the app labels fallback/cached behavior instead of hiding it.

## Safety Boundary

No automatic broadcast exists in the backend or frontend. The app prepares evidence and transaction payloads, then stops at user-controlled wallet signature.

## Verification

```bash
npm install
npm run build
npm run test -- --run
```

Production checks:

```text
GET https://circuitstock-agent-api.onrender.com/api/health
GET https://circuitstock-agent-api.onrender.com/api/judge/smoke
POST https://circuitstock-agent-api.onrender.com/api/agent/chat
```
