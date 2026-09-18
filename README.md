# CircuitStock Agent

Hackathon submission for BNB Hack: Tokenized Stocks Edition.

CircuitStock monitors tokenized-stock prices on BSC against reference prices, detects spreads, and prepares simulated rebalance actions before any user-signed transaction.

Repository: https://github.com/jordiparis165/circuitstock-agent

Status: working local product, private repo for now, ready for Render/Vercel deployment after account login. Make the repo public before final judging.

## Why this angle

- Fits tokenized-stock primitives: bStocks, xStocks, and Ondo-style tokenized exposure.
- Targets special prizes through Agentic Wallet / Wallet Skills and BNB Agent Studio positioning.
- Keeps execution cautious: scan, quote, official approval payload, swap calldata, gas checks, wallet checks, simulate, then require wallet signature.
- Never broadcasts transactions automatically.

## What Exists Now

- Dense Vite/React dashboard for judges.
- Express API server with signed Binance Web3 requests.
- Live RWA spread scanner for bStocks/Ondo categories.
- Agent recommendation engine with risk and max trade controls.
- End-to-end prepare flow:
  - RWA token scan.
  - Market/research context.
  - Wallet balance/portfolio checks.
  - Quote.
  - Official approve-transaction call.
  - Swap calldata build.
  - Gas price and gas limit checks.
  - Pre-transaction simulation.
  - User signature only, no broadcast.
- Compact agent endpoint for Wallet Skills / BNB Agent Studio.
- Plain-language stock prompt endpoint for Agentic Wallet style interactions.
- RWA platform discovery and ticker search.
- Skill files in `skills/circuitstock/`.
- Screenshots in `screenshots/`.
- Submission docs in `docs/`.

## Project Map

- `src/App.tsx` - main dashboard UI, wallet connect, signing buttons, evidence panel.
- `src/styles.css` - dashboard/mobile styling.
- `server/index.ts` - Express routes, strategy engine, execution prepare flow.
- `server/binanceWeb3.ts` - signed Binance Web3 API client and endpoint helpers.
- `server/env.ts` - `.env` parsing and Binance endpoint config.
- `server/tokenRegistry.ts` - local fallback/default token addresses.
- `docs/dev-experience-report.md` - hackathon DX report.
- `docs/demo-script.md` - video script under four minutes.
- `docs/submission.md` and `SUBMISSION.md` - final submission notes.
- `docs/team-onboarding.md` - teammate setup.
- `docs/agent-studio-x402.md` - BNB Agent Studio, ERC-8004/ERC-8183, and x402 packaging plan.
- `docs/final-deploy-runbook.md` - exact Render/Vercel/public repo submission steps.
- `skills/circuitstock/SKILL.md` and `skills/circuitstock/skill.json` - Wallet Skill/agent shape.
- `render.yaml` - Render API deployment config.
- `vercel.json` - Vercel frontend config.

## Environment

The server accepts either normalized keys or the French labels already present in the local `.env`:

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
VITE_API_BASE_URL=
BSC_USDC_ADDRESS=
AAPLX_ADDRESS=
TSLAB_ADDRESS=
SPYON_ADDRESS=
NVDAB_ADDRESS=
```

The app ships with default public addresses for BSC USDC and TSLAB so the quote flow can be demoed quickly. Live RWA token addresses are also loaded from Binance at runtime.

For teammate setup, see `docs/team-onboarding.md`. Keep `.env` local and share API credentials through a secure channel, not git history. `.gitignore` intentionally excludes `.env`, `node_modules`, and `dist`.

Official Binance Web3 API paths used by the MVP:

- RWA token list: `GET /api/v1/dex/market/rwa/tokens`
- RWA prices: `GET /api/v1/dex/market/rwa/price`
- RWA platforms/search: `GET /api/v1/dex/market/rwa/platforms`, `GET /api/v1/dex/market/rwa/search`
- RWA profile and market context: `GET /api/v1/dex/market/rwa/underlying-profile`, `GET /api/v1/dex/market/rwa/underlying-market`
- Market candles: `GET /api/v1/dex/market/candles`
- Aggregated quote: `GET /api/v1/dex/aggregator/quote`
- Approval transaction: `GET /api/v1/dex/aggregator/approve-transaction`
- Swap build: `GET /api/v1/dex/aggregator/swap`
- Gas checks: `GET /api/v1/dex/pre-transaction/gas-price`, `POST /api/v1/dex/pre-transaction/gas-limit`
- Transaction simulation: `POST /api/v1/dex/pre-transaction/simulate`
- Wallet checks: `GET /api/v1/dex/balance/all-token-balances-by-address`, `GET /api/v1/dex/market/portfolio/overview`

## Run

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:8787

## Test Commands

```bash
npm run build
```

Useful API checks:

```bash
curl http://localhost:8787/api/health
curl http://localhost:8787/api/evidence
curl http://localhost:8787/api/research/TSLAB
curl "http://localhost:8787/api/rwa/search?q=TSLA"
```

PowerShell prepare check:

```powershell
$body = @{
  symbol='TSLAB'
  side='buy'
  amountUsd=10
  walletAddress='0x000000000000000000000000000000000000dead'
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:8787/api/execution/prepare -Method Post -ContentType 'application/json' -Body $body
```

PowerShell natural-language agent check:

```powershell
$body = @{
  prompt='Quote only: buy $10 of TSLA tokenized stock'
  walletAddress='0x000000000000000000000000000000000000dead'
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:8787/api/agent/interpret -Method Post -ContentType 'application/json' -Body $body
```

## Judge Flow

1. Open the dashboard and confirm `mode: live` via the opportunity scanner.
2. Connect an injected wallet and switch to BNB Smart Chain.
3. Click **Prepare execution** on an agent action.
4. Review quote, official approval evidence, wallet checks, gas checks, research context, approval calldata, swap calldata, and simulation result.
5. Open **Agent Studio** and run the prompt demo.
6. Optionally try **Sign/copy approval** and **Sign/copy swap**. The app never broadcasts automatically.

## Local API

- `GET /api/market` - live opportunity scanner with RWA prices and spreads.
- `POST /api/strategy` - ranked live actions for the UI.
- `POST /api/agent/recommend` - agent-friendly recommendation payload for Wallet Skills / BNB Agent Studio.
- `POST /api/agent/recommend/compact` - compact agent payload for skills and agent runtimes.
- `POST /api/agent/interpret` - plain-language tokenized stock prompt parser and quote/research flow.
- `POST /api/execution/prepare` - quote, official approval, wallet snapshot, research, gas checks, swap build, simulation, and unsigned tx payloads.
- `GET /api/evidence` - sanitized evidence of Binance modules, endpoints, status and latency.
- `GET /api/rwa/platforms`, `GET /api/rwa/search?q=TSLA` - platform discovery and ticker resolution.
- `GET /api/research/:symbol` - candles, volatility, underlying profile and market context.
- `GET /api/wallet/:address` - balance and portfolio checks.
- `GET /api/tx/status/:hash` - post-signature transaction status lookup if a user broadcasts manually.
- `POST /api/quote`, `POST /api/swap`, `POST /api/simulate` - individual integration steps for debugging.

## Submission Materials

- `docs/dev-experience-report.md`
- `docs/demo-script.md`
- `docs/submission.md`
- `SUBMISSION.md`
- `skills/circuitstock/SKILL.md`
- `skills/circuitstock/skill.json`
- `screenshots/desktop-dashboard.png`
- `screenshots/mobile-dashboard.png`

## Current Verification

Last verified locally:

- `npm run build` passes.
- `/api/health` returns configured API status without exposing secrets.
- `/api/execution/prepare` returns quote, official approval, approval calldata, swap calldata, wallet check, gas check, research check, simulation summary, and `broadcasted: false`.
- `/api/agent/recommend/compact` returns a compact recommendation payload for agent runtimes.
- `/api/evidence` records recent Binance Web3 modules/endpoints with latency.

## Deploy

### Render API

Create a Render web service from this repo:

- Build command: `npm install`
- Start command: `npm start`
- Health check: `/api/health`
- Required secrets: `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET`

`render.yaml` includes the non-secret defaults.

### Vercel Frontend

Create a Vercel project from this repo:

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE_URL=https://your-render-service.onrender.com`

## Next build steps

1. Deploy the frontend/API pair to a public URL for judging.
2. Record the demo video using `docs/demo-script.md`.
3. Convert the documented skill shape into a published Wallet Skill or Agent Studio runtime if time allows.
4. Add deployed URLs and video link to `SUBMISSION.md`.
5. Make the GitHub repository public before submitting.
6. Rotate Binance Web3 credentials after the hackathon.
