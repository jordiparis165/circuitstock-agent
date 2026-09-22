# Submission Notes

## Project

CircuitStock Agent

## One-liner

An agentic BSC tokenized-stocks scanner that detects on-chain/reference spreads, prepares rebalances with Binance Web3 quotes, builds swap calldata, and simulates before any wallet signature.

## What It Uses

- Binance Web3 RWA Data API
- Binance Web3 Market API
- Binance Web3 Trading API
- Binance Web3 Transaction API
- Binance Web3 Wallet API
- BNB Smart Chain mainnet
- Wallet-side signing boundary

## How To Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Judge Checklist

- API key remains server-side.
- `GET /api/market` returns live RWA data.
- `GET /api/evidence` returns sanitized API modules, endpoints, status, and latency.
- `GET /api/rwa/platforms` and `GET /api/rwa/search?q=TSLA` prove platform discovery and ticker resolution.
- `GET /api/research/:symbol` returns candles, volatility, underlying profile, and underlying market context.
- `GET /api/wallet/:address` checks balances and portfolio state before execution.
- `POST /api/execution/prepare` returns quote, official approval check, approval transaction payload, swap payload, gas checks, wallet snapshot, research context, and simulation result.
- `POST /api/agent/recommend/compact` returns the concise payload intended for Wallet Skills / Agent Studio.
- `POST /api/agent/interpret` accepts plain-language stock-trading prompts and returns research or a no-broadcast execution preview.
- `GET /api/b402/manifest` exposes the demo payment manifest for premium agent monitoring.
- `POST /api/premium/signal` returns `402 Payment Required` unless the hackathon demo payment header is supplied.
- `GET /api/watcher/status` exposes the dry-run autonomous runtime policy, kill switch, budget and latest decisions.
- `POST /api/watcher/tick` runs one manual dry-run evaluation for judge review.
- `POST /api/baskets/plan` returns a thematic no-broadcast basket plan for AI Chips, Magnificent 7, ETF or Buffett-style baskets.
- `GET /api/judge/readiness` and `GET /api/judge/smoke` provide one-call judge verification.
- No automatic broadcast exists in the app.
- `POST /api/agent/recommend` exposes the same logic for agent runtimes.

## Agent Skills Shape

### `scan_tokenized_stock_spreads`

Input:

```json
{
  "platforms": ["bstock", "ondo"],
  "tabs": [9, 4, 11],
  "risk": "balanced"
}
```

Output: ranked opportunities with spread, liquidity, score, action, and reason.

### `prepare_rebalance`

Input:

```json
{
  "symbol": "TSLAb",
  "side": "buy",
  "amountUsd": 10,
  "walletAddress": "0x..."
}
```

Output: quote, selected route, official approval evidence, swap calldata, gas checks, wallet snapshot, simulation result, and a no-broadcast checklist.

### `plain_language_stock_prompt`

Input:

```json
{
  "prompt": "Quote only: buy $10 of TSLA tokenized stock",
  "walletAddress": "0x..."
}
```

Output: parsed intent, RWA search/profile/market data, optional prepared execution, and a plain-language summary.

### `premium_signal_demo`

Input:

```json
{
  "risk": "balanced",
  "maxTradeUsd": 10,
  "platforms": ["bstock"],
  "tabs": [9]
}
```

Output: b402/x402-compatible demo payment response. With header `x-demo-payment: paid`, returns premium monitoring summary and top opportunities. This is demo mode, not production settlement.

### `dry_run_watcher`

Input: no body.

Call:

```text
POST /api/watcher/tick
```

Output: policy decision and current watcher status. The watcher is intentionally dry-run by default, requires `AUTO_ALLOWED_SYMBOLS`, respects daily budget/cooldown/spread/liquidity rules, and refuses live mode until an executor is wired.

### `plan_thematic_basket`

Input:

```json
{
  "theme": "ai-chips",
  "amountUsd": 25,
  "risk": "balanced",
  "platforms": ["bstock"]
}
```

Output: basket thesis, legs, allocation, spread, liquidity, score and required user action. Legs are `buy` only when the token is below reference price; otherwise they remain `watch`.

## Deployment

- API target: Render web service using `render.yaml`.
- Frontend target: Vercel static Vite app using `VITE_API_BASE_URL`.
- Secrets stay only in Render environment variables.

## Final Submission Checklist

- Make the GitHub repository public before judging.
- Add Render API URL to `SUBMISSION.md`.
- Add Vercel frontend URL to `SUBMISSION.md`.
- Record a demo video under four minutes from `docs/demo-script.md`.
- Add desktop and mobile screenshots in `screenshots/`.
- Rotate Binance Web3 credentials after the event.
- See `docs/agent-studio-x402.md` for the ERC-8004 / ERC-8183 / x402 packaging plan.
