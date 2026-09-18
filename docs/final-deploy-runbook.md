# Final Deploy Runbook

Use this when the team is ready to publish the hackathon submission.

## Current State

- GitHub repo: `https://github.com/jordiparis165/circuitstock-agent`
- Current visibility: private
- Vercel frontend: `https://circuitstock-agent.vercel.app`
- Render API: `https://circuitstock-agent-api.onrender.com`
- Vercel production env `VITE_API_BASE_URL` points to: `https://circuitstock-agent-api.onrender.com`
- Local build: `npm run build`
- API start command: `npm start`
- Frontend output directory: `dist`
- Secrets are not committed. Keep `.env` local.

## Step 1 - Render API

Create a new Render Web Service from the GitHub repo.

Settings:

```text
Name: circuitstock-agent-api
Runtime: Node
Build command: npm install
Start command: npm start
Health check path: /api/health
```

Required Render environment variables:

```env
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_API_SECRET=
BINANCE_WEB3_BASE_URL=https://web3.binance.com/build
BINANCE_WEB3_QUOTE_PATH=/api/v1/dex/aggregator/quote
BINANCE_WEB3_SWAP_PATH=/api/v1/dex/aggregator/swap
BINANCE_WEB3_APPROVE_PATH=/api/v1/dex/aggregator/approve-transaction
BINANCE_WEB3_AGGREGATOR_HISTORY_PATH=/api/v1/dex/aggregator/history
BINANCE_WEB3_SIMULATE_PATH=/api/v1/dex/pre-transaction/simulate
BINANCE_WEB3_GAS_PRICE_PATH=/api/v1/dex/pre-transaction/gas-price
BINANCE_WEB3_GAS_LIMIT_PATH=/api/v1/dex/pre-transaction/gas-limit
BINANCE_WEB3_RWA_TOKENS_PATH=/api/v1/dex/market/rwa/tokens
BINANCE_WEB3_RWA_PRICE_PATH=/api/v1/dex/market/rwa/price
BINANCE_WEB3_RWA_PLATFORMS_PATH=/api/v1/dex/market/rwa/platforms
BINANCE_WEB3_RWA_SEARCH_PATH=/api/v1/dex/market/rwa/search
BINANCE_WEB3_RWA_UNDERLYING_PROFILE_PATH=/api/v1/dex/market/rwa/underlying-profile
BINANCE_WEB3_RWA_UNDERLYING_MARKET_PATH=/api/v1/dex/market/rwa/underlying-market
BINANCE_WEB3_MARKET_CANDLES_PATH=/api/v1/dex/market/candles
BINANCE_WEB3_WALLET_ALL_BALANCES_PATH=/api/v1/dex/balance/all-token-balances-by-address
BINANCE_WEB3_WALLET_PORTFOLIO_OVERVIEW_PATH=/api/v1/dex/market/portfolio/overview
BSC_RPC_URL=https://bsc-dataseed.binance.org
```

Verify:

```bash
curl https://YOUR_RENDER_URL/api/health
curl https://YOUR_RENDER_URL/api/rwa/platforms
curl "https://YOUR_RENDER_URL/api/rwa/search?q=TSLA"
```

## Step 2 - Vercel Frontend

Create a Vercel project from the same repo.

Settings:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
```

Required Vercel environment variable:

```env
VITE_API_BASE_URL=https://YOUR_RENDER_URL
```

Verify:

```text
Open https://YOUR_VERCEL_URL
Confirm API key: configured
Confirm Market data: live or cached
Run Agent Studio prompt: Quote only: buy $10 of TSLA tokenized stock
```

## Step 3 - Submission URLs

Update `SUBMISSION.md`:

```text
Live demo: https://YOUR_VERCEL_URL
API: https://YOUR_RENDER_URL
Demo video: https://YOUR_VIDEO_URL
Repository: https://github.com/jordiparis165/circuitstock-agent
```

Commit and push:

```bash
git add SUBMISSION.md
git commit -m "Add final submission links"
git push
```

## Step 4 - Make Repo Public

Only do this when ready to submit:

```bash
gh repo edit jordiparis165/circuitstock-agent --visibility public --accept-visibility-change-consequences
```

## Step 5 - Demo Video

Use `docs/demo-script.md`.

Must show:

- Live/cached RWA data.
- bStock opportunity scanner.
- Agent Studio prompt.
- Prepare execution.
- Quote ID and vendor.
- Wallet checks.
- Official approval.
- Gas checks.
- Simulation result.
- Sign/copy fallback.
- No broadcast.

## Known External Blockers

- Vercel deployment needs `vercel login` or `VERCEL_TOKEN`.
- Render deployment needs Render account access.
- Final judging needs public repo visibility.
