# CircuitStock Agent - Final Submission

## Links

- Live demo: https://circuitstock-agent.vercel.app
- API: https://circuitstock-agent-api.onrender.com
- Repository: https://github.com/jordiparis165/circuitstock-agent
- Demo video: add the recorded link after following `docs/demo-script.md`

## One-Liner

CircuitStock is an agentic BSC tokenized-stocks cockpit: it compares bStocks/Ondo prices, checks premiums against independent references when configured, explains opportunities, drafts alerts/plans, enforces risk rules, and keeps every action simulated unless the user explicitly signs somewhere else.

## What To Show Judges

1. Open the live app and start on **Dashboard**.
2. Show issuer spread, premium/reference state, replay/live status and visible checks.
3. Open **Agent** and ask: `buy 50 USD of MSFT`.
4. Show the simulated agent card: checks, issuer choice, risk settings, no signature and no broadcast.
5. Ask: `previens moi quand NVDA est sous la prime 0.2`.
6. Show the alert draft and explain it is in-app/simulated until the user confirms real automation.
7. Open **Settings** and show the kill switch, allowed symbols, max trade, max daily budget, slippage, cooldown and round-trip cost guard.
8. Open **Skills** and run/check the Wallet Skills log.
9. Mention API verification: `/api/health`, `/api/skills/check`, `/api/judge/smoke`, `/api/evidence`.

## Technical Highlights

- Server-side Binance Web3 signed API client with secrets kept off the browser.
- Cross-issuer bStock/Ondo snapshot and token-to-share normalization.
- Independent reference layer: Alpaca primary, Finnhub fallback, explicit inactive status when not configured.
- Agent path: `/api/agent/chat`, `/api/agent/action`, `/api/settings`, `/api/alerts`, `/api/plans`, `/api/market/overview`, `/api/skills/check`.
- Safety path: simulated-only actions, kill switch, explicit whitelist, daily budget, cooldown, slippage limit, measured round-trip cost gate and no broadcast.
- Wallet Skills proof: read-only Binance skill clients with a public `/api/skills/log` and `/api/skills/check`.
- Judge evidence: `/api/health`, `/api/evidence`, `/api/judge/readiness`, `/api/judge/smoke`.

## Honest Scope

- Real: Binance Web3 API integration, Wallet Skills checks/logging, deterministic tool layer, settings, alerts/plans storage, replay snapshot tooling and tests.
- Simulated: buys, rotations, recurring plans, alerts and autonomous watcher execution.
- Optional: OpenAI routing/wording activates if `OPENAI_API_KEY` is configured; otherwise common prompts use deterministic fallback.
- Independent reference layer needs Alpaca/Finnhub keys and a populated `config/universe.json`; without them the app says the reference is inactive.

## Safety Boundary

No automatic broadcast exists in the deployed app. The app explains, simulates, records and shows evidence, but it does not sign or send transactions.

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
