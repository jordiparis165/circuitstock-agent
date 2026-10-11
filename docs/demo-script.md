# Demo Script

Target length: 3:30 to 4:00.

## 0:00 - 0:25: Hook

"CircuitStock is an AI agent cockpit for tokenized stocks on BSC. It scans bStocks and Ondo spreads, explains what changed, prepares execution evidence, and stops before broadcast so the user stays in control."

Open: `https://circuitstock-agent.vercel.app`

## 0:25 - 0:55: Monitor

Show the dashboard:

- platform filters: bStocks/Ondo
- live/cached market status
- spread table
- API evidence

Say: "The scanner is powered by Binance Web3 RWA and Trading APIs. When production APIs rate-limit or cache, the UI labels that state instead of pretending."

## 0:55 - 1:35: Execution Evidence

Click a recommendation or use the first-stock flow.

Show:

- quote ID
- approval target
- swap calldata
- gas/simulation result
- `No broadcast`

Say: "This is not an auto-trader. CircuitStock builds and simulates the transaction, then the user wallet decides whether to sign. If simulation fails, that becomes the product message."

## 1:35 - 2:35: Agent Studio

Open **Agent Studio**.

Prompt 1:

```text
buy 50 USD of AAPL
```

Show the simulated card, checks and `would_change_if`.

Prompt 2:

```text
préviens moi quand NVDA est sous la prime 0.2
```

Show alert draft.

Say: "The agent can advise, draft alerts and propose plans, but execution stays simulated unless the user confirms. OpenAI is optional; the demo has deterministic fallback so it still runs without paid LLM credit."

## 2:35 - 3:15: Risk Rules

Show settings/guardrails:

- kill switch
- max trade
- max daily budget
- allowed symbols
- slippage
- cooldown
- dry-run watcher

Say: "This is the winning safety angle: an agent with risk rules, not a black-box button."

## 3:15 - 3:45: Judge Mode

Open **Judge Mode** and run smoke checks.

Show:

- `/api/health`
- `/api/evidence`
- `/api/judge/smoke`
- Wallet Skills availability/log

Say: "The judge can test the API surface without needing our private keys."

## 3:45 - 4:00: Close

"CircuitStock combines live tokenized-stock infrastructure with a practical AI-agent UX: monitor, explain, prepare, simulate, require user control. No automatic broadcast, no hidden key exposure."
