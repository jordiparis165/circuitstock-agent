# Final Deliverable

Use this as the final send checklist.

## Submit These Links

- Frontend: https://circuitstock-agent.vercel.app
- API: https://circuitstock-agent-api.onrender.com
- GitHub: https://github.com/jordiparis165/circuitstock-agent
- Demo video: record with `docs/demo-script.md`, then paste the video URL here.

## Pasteable Summary

CircuitStock is an AI-agent cockpit for tokenized stocks on BSC. It scans bStocks/Ondo spreads with Binance Web3 APIs, explains opportunities through an agent interface, prepares quote/approval/swap/simulation evidence, and enforces risk rules such as kill switch, max trade, daily budget, slippage and cooldown. It is no-broadcast by design: users keep wallet control.

## Pasteable Technical Description

The project uses Binance Web3 RWA, Market, Trading, Transaction and Wallet APIs from a server-side signed client. The frontend exposes Monitor, Agent Studio, Wallet Skills, Risk Rules and Judge Mode. The agent can parse prompts, propose simulated buys, draft alerts/plans, check premiums, expose compact Wallet Skill payloads, and run a dry-run watcher with guardrails. `/api/judge/smoke` and `/api/evidence` provide quick verification for judges.

## Pasteable Limitations

Real execution is intentionally bounded. CircuitStock prepares calldata and simulation only; it never broadcasts. Conversational actions and plans are simulated until a user confirms and a wallet signs. OpenAI is optional; deterministic fallback keeps the demo usable. Independent market reference prices require Alpaca/Finnhub keys and a populated universe file.

## Commands Expected To Pass

```bash
npm run build
npm run test -- --run
```
