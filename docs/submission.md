# Submission Notes

## Project

CircuitStock Agent

## One-liner

An agentic BSC tokenized-stocks scanner that detects on-chain/reference spreads, prepares rebalances with Binance Web3 quotes, builds swap calldata, and simulates before any wallet signature.

## What It Uses

- Binance Web3 RWA Data API
- Binance Web3 Trading API
- Binance Web3 Transaction API
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
- `POST /api/execution/prepare` returns quote, approval transaction payload, swap transaction payload, and simulation result.
- `POST /api/agent/recommend/compact` returns the concise payload intended for Wallet Skills / Agent Studio.
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

Output: quote, selected route, swap calldata, simulation result, and a no-broadcast checklist.

## Deployment

- API target: Render web service using `render.yaml`.
- Frontend target: Vercel static Vite app using `VITE_API_BASE_URL`.
- Secrets stay only in Render environment variables.
