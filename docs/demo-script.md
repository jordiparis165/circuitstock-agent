# Demo Script

Target length: 3:30 to 4:00.

## 0:00 - 0:25: Hook

"CircuitStock is an AI agent cockpit for tokenized stocks on BSC. It compares bStocks and Ondo issuers, checks the reference layer, explains the result, and keeps execution simulated so the user stays in control."

Open: `https://circuitstock-agent.vercel.app`

## 0:25 - 0:55: Dashboard

Show:

- issuer spread heatmap
- replay/live status
- premium/reference state
- visible checks

Say: "The important product choice is honesty: if the independent reference or a skill is unavailable, the UI labels it instead of inventing a signal."

## 0:55 - 1:45: Agent

Open **Agent**.

Prompt 1:

```text
buy 50 USD of MSFT
```

Show the simulated card, issuer choice, checks, no signature and no broadcast.

Prompt 2:

```text
previens moi quand NVDA est sous la prime 0.2
```

Show the alert draft.

Say: "The model, when configured, only routes the request and words the response. The numbers and checks come from deterministic code. Without an OpenAI key, common prompts still route through deterministic fallback."

## 1:45 - 2:35: Settings And Safety

Open **Settings**.

Show:

- kill switch
- max order
- premium threshold
- allowed issuers
- confirmation mode
- change log

Say: "This is the agent safety layer. The agent may propose a settings change, but settings remain the source of truth and require user confirmation."

## 2:35 - 3:15: Portfolio, Alerts, Plans

Open **Portfolio**, **Alerts** and **Plans** quickly.

Say: "Every portfolio rotation, alert and recurring plan is simulated in this build. That makes the agent useful for judging without pretending we have live autonomous settlement."

## 3:15 - 3:45: Skills And API Evidence

Open **Skills**.

Show:

- Wallet Skills checks
- call log
- audit unknown/pass/fail behavior

Mention API endpoints:

- `/api/health`
- `/api/skills/check`
- `/api/judge/smoke`
- `/api/evidence`

## 3:45 - 4:00: Close

"CircuitStock combines tokenized-stock market structure with an agent UX: compare issuers, explain premiums, draft actions, enforce guardrails, and never broadcast automatically."
