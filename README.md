# CircuitStock Agent

Hackathon MVP for BNB Hack: Tokenized Stocks Edition.

CircuitStock monitors tokenized-stock prices on BSC against reference prices, detects spreads, and prepares simulated rebalance actions before any user-signed transaction.

## Why this angle

- Fits tokenized-stock primitives: bStocks, xStocks, and Ondo-style tokenized exposure.
- Targets special prizes through Agentic Wallet / Wallet Skills and BNB Agent Studio positioning.
- Keeps execution cautious: quote, simulate, then require wallet signature.

## Environment

The server accepts either normalized keys or the French labels already present in the local `.env`:

```env
BINANCE_WEB3_API_KEY=
BINANCE_WEB3_API_SECRET=
BINANCE_WEB3_BASE_URL=https://web3.binance.com/build
BINANCE_WEB3_QUOTE_PATH=/api/v1/dex/aggregator/quote
BINANCE_WEB3_SWAP_PATH=/api/v1/dex/aggregator/swap
BINANCE_WEB3_SIMULATE_PATH=/api/v1/dex/pre-transaction/simulate
BINANCE_WEB3_RWA_TOKENS_PATH=/api/v1/dex/market/rwa/tokens
BINANCE_WEB3_RWA_PRICE_PATH=/api/v1/dex/market/rwa/price
BSC_RPC_URL=https://bsc-dataseed.binance.org
VITE_API_BASE_URL=
BSC_USDC_ADDRESS=
AAPLX_ADDRESS=
TSLAB_ADDRESS=
SPYON_ADDRESS=
NVDAB_ADDRESS=
```

The app ships with default public addresses for BSC USDC and TSLAB so the quote flow can be demoed earlier. Override them in `.env` after verifying the final competition asset list.

Official Binance Web3 API paths used by the MVP:

- RWA token list: `GET /api/v1/dex/market/rwa/tokens`
- RWA prices: `GET /api/v1/dex/market/rwa/price`
- Aggregated quote: `GET /api/v1/dex/aggregator/quote`
- Swap build: `GET /api/v1/dex/aggregator/swap`
- Transaction simulation: `POST /api/v1/dex/pre-transaction/simulate`

## Run

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:8787

## Judge Flow

1. Open the dashboard and confirm `mode: live` via the opportunity scanner.
2. Connect an injected wallet and switch to BNB Smart Chain.
3. Click **Prepare execution** on an agent action.
4. Review the quote, route, approval calldata, swap calldata, and simulation result.
5. Optionally try **Sign approval only** and **Sign swap only**. The app never broadcasts automatically.

## Local API

- `GET /api/market` - live opportunity scanner with RWA prices and spreads.
- `POST /api/strategy` - ranked live actions for the UI.
- `POST /api/agent/recommend` - agent-friendly recommendation payload for Wallet Skills / BNB Agent Studio.
- `POST /api/agent/recommend/compact` - compact agent payload for skills and agent runtimes.
- `POST /api/execution/prepare` - quote, build swap, simulate, and return unsigned tx payload.
- `POST /api/quote`, `POST /api/swap`, `POST /api/simulate` - individual integration steps for debugging.

## Submission Materials

- `docs/dev-experience-report.md`
- `docs/demo-script.md`
- `docs/submission.md`
- `SUBMISSION.md`
- `skills/circuitstock/SKILL.md`

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
