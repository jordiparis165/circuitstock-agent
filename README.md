# CircuitStock Agent

**Compare the same tokenized stock across issuers, against the real share price, and ask an agent what it means — in plain language, with every number checked and nothing ever signed.**

Submission for BNB Hack: Tokenized Stocks Edition.

- Live frontend: https://circuitstock-agent.vercel.app
- Live API: https://circuitstock-agent-api.onrender.com
- Repository: https://github.com/jordiparis165/circuitstock-agent

> **Informational and experimental. Not financial advice.**
> CircuitStock never signs and never broadcasts a transaction. Every "buy", "rotation" and "plan"
> in this app is a simulation. There is no execution path enabled in the deployed build.

---

## The problem

A tokenized stock can trade at a different price on two issuers at the same moment, and both can
drift from the real share price on the underlying exchange. Three numbers matter and they are
rarely shown together:

| Number | What it means |
|---|---|
| **Issuer spread** | Ondo's price per share vs bStock's, for the same ticker |
| **Premium vs reference** | Each issuer's price vs the actual stock price from an independent market-data feed |
| **Measured round-trip cost** | What it would really cost to go in and out — the figure that usually eats the spread |

A wide spread is not a profit. CircuitStock shows all three and lets an agent reason about them
out loud, with its checks visible.

### Why the reference price is the hard part

Binance's RWA API returns a `referencePrice` field. We probed it empirically and found it is
**derived from the on-chain price**, so it cannot be used to detect that the on-chain price has
drifted — it moves with it. Using it as a reference would make every premium read ~0%.

CircuitStock therefore pulls its reference from an independent market-data provider (Alpaca IEX,
with Finnhub as fallback). See `docs/dx-report-notes.md` for the probe.

---

## What a user can actually do

| Page | What it does |
|---|---|
| **Dashboard** | Premium/discount heatmap across every covered ticker. Tiles are ranked by issuer spread; click one to ask the agent about it. |
| **Agent** | Ask in plain English ("is AAPL expensive right now?"). The model picks a tool; the tool computes the answer. Every reply shows its checks and what would change its mind. |
| **Portfolio** | Simulated holdings and rotation suggestions. Confirming one records a simulated fill — no signature, no broadcast. |
| **Alerts** | Threshold alerts per ticker (premium, issuer gap, market state). Create them in the UI or by asking the agent. "Test" fires one immediately. |
| **Plans** | Recurring simulated buys (daily/weekly/monthly) with per-plan constraints: cheapest issuer, max premium, skip when the market is closed. |
| **Settings** | The agent's source of truth: order limits, premium thresholds, rotation rules, audit policy, presets, and a full change log. |
| **Activity** | Every decision the agent cycle made, including the ones where it chose not to act, with the violated rule. |
| **Skills** | Real Binance Wallet Skills calls with latency and outcome. A log, not a claim. |
| **Opportunities** | Marked *experimental*: news screening is off until a source is confirmed. The page says so rather than showing an empty table. |

A **kill switch** sits in the header of every page. Turning the agent off stops all suggestions,
plans and alerts immediately; the dashboard stays readable.

---

## How the agent works

The design rule: **the model decides what to do, code decides what is true.**

```
user message
   │
   ▼
 LLM router ──► {tool, ticker, amount}      ← the only thing the model chooses
   │
   ▼
 deterministic tool  ──►  price, premium, checks, thresholds   ← computed in code
   │
   ▼
 LLM phrasing (optional) ──► natural-language wording          ← no figures of its own
```

The model **cannot produce a number that reaches the user.** Prices, premiums, check results and
thresholds are computed by `server/agent/chatTools.ts` and `server/agent/guardrails.ts`. The model
only routes the request and, optionally, rewords the deterministic answer. If it returns a tool
name that does not exist, the call is rejected against an allowlist.

**Quick actions** call the same tools directly with no model at all. If the LLM key is missing,
common chat prompts use a narrow deterministic router; if the key is invalid or the daily budget is
spent, the chat says so plainly and quick actions keep working. The app never lets a model invent a
price, premium or decision.

Each answer reports its own provenance in the footer — `Computed by code - no model involved`, or
`gpt-5: routed to get_premium, wording only - figures computed by code`.

### Guardrails

- **Settings are the source of truth.** The agent may *propose* a settings change; it never writes
  one. `previewPreset()` computes the proposal without touching stored state.
- **Prompt injection.** The user's message, token names and snapshot values are passed to the model
  inside a JSON envelope and labelled as data. The system prompt states they are never instructions.
- **Public endpoint abuse.** `/api/agent/chat` is rate limited per IP (default 10/min) and capped by
  a daily token budget (default 120k). The deployed URL is public and must not become a free proxy
  to someone's OpenAI key.
- **Part B agent cycle.** The model may only choose an action, a confidence and a rationale. Token
  addresses, trade size and slippage are overwritten with the strategy's computed values before
  `validateIntent()` runs, so a hallucinated size cannot reach the executor.

---

## API

Base URL: `http://localhost:8787` in development.

### Agent

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/agent/chat` | Free text. Rate limited. Returns a card plus an `llm` provenance block. |
| `POST` | `/api/agent/action` | Run one tool directly, no model. Body: `{tool, ticker?, amount_usd?, preset?}`. |
| `GET` | `/api/agent/status` | Whether the model is configured, the token budget, the tool list. |
| `GET` | `/api/agent/part-b/ledger` | Decision journal. |
| `POST` | `/api/agent/part-b/run` | Run one agent cycle against a snapshot. |

Tools: `propose_buy`, `get_premium`, `propose_rotation`, `create_alert`, `create_plan`,
`propose_setting_change`.

Every chat/action response carries `card.checks[]` — each with a status, the value, the threshold
it was compared against, and the source the value came from.

### Market, settings and portfolio

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Per-source truth: Binance, Alpaca, Finnhub, LLM, whether the independent reference is actually active. |
| `GET` | `/api/market/overview` | Heatmap data with a replay flag and capture timestamp. |
| `GET` | `/api/settings` · `PUT` | Read / update settings, with change history. |
| `POST` | `/api/settings/kill` | Global kill switch. |
| `GET` | `/api/portfolio` | Simulated holdings. |
| `GET` | `/api/rebalance/suggestions` · `POST /api/rebalance/confirm` | Rotation suggestions and simulated confirmation. |

### Alerts, plans, skills

`GET POST /api/alerts`, `PATCH DELETE /api/alerts/:id`, `POST /api/alerts/:id/test`
`GET POST /api/plans`, `PATCH DELETE /api/plans/:id`, `POST /api/plans/:id/run`
`GET /api/skills/log`, `GET /api/skills/check`

---

## Wallet Skills

Read-only clients in `server/skills/`, each call logged with endpoint, latency and outcome:

- **`binance-tokenized-securities-info`** — Ondo market status and token listing.
- **`query-token-audit`** — security filter. A verdict only counts when the response reports both
  `hasResult` and `isSupported`, per the skill's own rule.

  **Measured finding (2026-10-11): this skill does not cover tokenized securities.** Real RWA
  contracts return `hasResult: false` / `isSupported: false`, while a plain BEP-20 (USDT) returns a
  full verdict with risk items. We therefore show the audit as an explicit **unknown** check rather
  than a pass (which would claim a check we never got) or a hard failure (which would block every
  ticker in the track this hackathon is about). Real `MEDIUM`/`HIGH` verdicts still block according
  to `audit_block_level`.
- **`query-token-info`** — dynamic token info.

The **Skills** page shows the real call log and a "Run check" button that calls each skill once and
reports pass/fail. We do not claim an execution layer built on Skills — these are reads that inform
simulated decisions.

---

## Setup

```bash
git clone https://github.com/jordiparis165/circuitstock-agent
cd circuitstock-agent
npm install
cp .env.example .env     # fill in the keys below
npm run dev              # API on :8787, frontend on :5173
```

### Environment

| Variable | Required | Without it |
|---|---|---|
| `BINANCE_WEB3_API_KEY` / `_SECRET` | yes | No on-chain prices at all |
| `ALPACA_KEY` / `ALPACA_SECRET` | for the real signal | No independent reference; premium cannot be computed, and market state fails closed |
| `FINNHUB_KEY` | fallback | Alpaca has no backup |
| `OPENAI_API_KEY` | for LLM routing/wording | Common prompts use deterministic fallback; quick actions still work |
| `LLM_RATE_LIMIT_PER_MIN`, `LLM_DAILY_TOKEN_BUDGET` | no | Defaults: 10/min, 120k tokens/day |

**The independent reference needs two things, not one.** Keys alone are not enough:
`config/universe.json` ships as an empty placeholder and must be generated once, with the Alpaca
keys set:

```bash
npx tsx scripts/build-universe.ts
```

Until that file is populated, the backend falls back to the Binance-derived figure, and
`/api/health` reports `sources.independentReferenceActive: false`. Check that field before
trusting a premium.

**Region.** Run the backend from a non-restricted region without a VPN — Binance returns
`40301`/`40302`/`40303` otherwise, and the app will look empty.

### Commands

```bash
npm run dev       # API + frontend with hot reload
npm test          # 43 unit tests (spread math, guardrails, agent policy, chat contract)
npm run build     # typecheck + production build
npm start         # API only

./scripts/audit-api.sh [base-url]         # hits every endpoint the UI needs, prints pass/fail
npx tsx scripts/record-snapshot.ts        # re-record the replay snapshot from live data
npx tsx scripts/build-universe.ts         # generate config/universe.json (needs Alpaca keys)
```

---

## Replay mode

The dashboard and the agent read a recorded snapshot rather than a live feed. The header shows a
permanent **REPLAY** badge with the capture timestamp, and `/api/market/overview` returns
`replay: true`. This makes the demo reproducible when the US market is closed — which it is all
weekend, including during judging.

The snapshot is **recorded from the live Binance Web3 RWA API**, not written by hand:

```bash
npx tsx scripts/record-snapshot.ts --archive
```

It pairs every ticker listed by both issuers on BSC, converts each to a price per share
(`tokenPrice / tokenToShareRatio` — ratios differ per issuer, so comparing raw token prices
invents spreads), stamps the capture time and archives to `data/snapshots/<date>/<HHMM>.json`.
The current snapshot holds 40 cross-issuer pairs with real contract addresses.

`reference` is written as `null` unless an independent reference was actually fetched, so a
missing Alpaca key shows as "no reference source configured" rather than a premium computed
against nothing.

Tests do not use this file. They read `fixtures/snapshot.test.json` via `AGENT_SNAPSHOT_PATH`,
because a test must not break when the market moves.

---

## What is real, what is not

**Real:** Binance Web3 signed API calls · Wallet Skills HTTP calls with logged latency · spread and
premium math (`Decimal`, never float) · guardrails and policy validation · settings, alerts, plans
and the decision journal, all persisted to disk · the kill switch · LLM routing when a key is set.

**Simulated:** every buy, rotation and plan run. Nothing is signed, nothing is broadcast, no wallet
key is ever held by the app.

**Not active yet:** independent reference price (needs Alpaca keys + a generated universe) · news
screening on the Opportunities page · automatic alert and plan scheduling — both are created and
persisted, but no background loop evaluates them, so they fire only when tested or run manually.

For the current page-by-page state, see `docs/FINAL_AUDIT.md`.

---

## Project map

```
server/
  index.ts              Express app, all routes
  agent/
    llm.ts              OpenAI client: routing, intent proposal, phrasing
    llmBudget.ts        per-IP rate limit + daily token cap
    llmClient.ts        LlmClient impls: OpenAI, deterministic fallback
    chatTools.ts        the tools themselves - every figure is computed here
    guardrails.ts       validateIntent: the code that disposes
    strategy.ts         rotation opportunity selection
    runner.ts           agent cycle: propose -> validate -> simulate -> journal
    settings.ts         source of truth + change log
    alerts.ts plans.ts ledger.ts
  skills/               Binance Wallet Skills clients + call log
  referencePrice.ts     Alpaca (WS + REST) and Finnhub
src/
  pages/                one file per page
  components/Layout.tsx shell, header, kill switch, wallet connect
scripts/
  audit-api.sh          endpoint smoke test
  build-universe.ts     generates config/universe.json
```
