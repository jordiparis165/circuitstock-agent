# Developer Experience Report

## Summary

CircuitStock Agent integrates Binance Web3 API modules for the BNB Hack: Tokenized Stocks Edition:

- RWA Data API for tokenized stock lists, reference prices, on-chain prices, market status, and liquidity.
- Trading API for cross-DEX quote and swap calldata construction.
- Transaction API for pre-trade simulation.

The working flow is: scan RWA tokens, score opportunities, quote a small USDC trade, build swap calldata, simulate it, and leave final signing to the user wallet.

## Onboarding Notes

- The hackathon resources page was the most useful starting point because it linked the full docs index and `llms-full.txt`.
- The key authentication detail is that the base URL is `https://web3.binance.com/build`.
- The signed request path must include `/build`; signing only `/api/v1/...` causes invalid signature errors.
- The required auth headers are `X-OC-APIKEY`, `X-OC-TIMESTAMP`, and `X-OC-SIGN`.
- The signature is Base64-encoded HMAC-SHA256 over `timestamp + method + requestPath + body`.

## Endpoints Used

- `GET /api/v1/dex/market/rwa/tokens`
- `GET /api/v1/dex/market/rwa/price`
- `GET /api/v1/dex/aggregator/quote`
- `GET /api/v1/dex/aggregator/swap`
- `POST /api/v1/dex/pre-transaction/simulate`

## API Pitfalls

- The `/quote` result has a short-lived `quoteId`; `/swap` must be called quickly.
- The simulation endpoint may return `success: true` while the simulated execution status is `FAILED`, for example when ERC-20 allowance is missing. The app treats this as useful pre-trade feedback rather than a transport failure.
- RWA Data API calls can hit rate limits during rapid local iteration. CircuitStock uses a short 30-second cache for scanner data.
- Swap responses may include nested `tx` payloads rather than a top-level transaction object, so the app extracts transaction data defensively.
- During local testing, `POST /api/execution/prepare` successfully returned a quote, swap calldata and simulation. The simulation correctly caught `BEP20: transfer amount exceeds allowance`, which the UI now translates into an approval-first action.

## Tokenized Stock Specifics

- RWA token payloads include both `tokenPrice` and `referencePrice`, which is exactly what a spread scanner needs.
- `statusInfo` is useful for distinguishing normal trading from market-closed behavior.
- bStocks routes can involve multiple DEX hops through USDC, BTCB, ETH, USDT, and the target bStock.
- Simulation often reveals required approvals before users waste gas.
- Approval calldata is returned through Trading API `signatureData`; CircuitStock extracts this into an approval transaction that can be signed separately from the swap.

## AI Stack Feedback

- The best Wallet Skills shape is two tools:
  - `scan_tokenized_stock_spreads`
- `prepare_rebalance`
- `prepare_rebalance` returns a compact `required_user_action` so agent runtimes can ask the user for approval before any signing.
- Agent Studio is a natural fit for persistent monitoring, especially if the runtime calls `/api/agent/recommend` on a schedule.
- A first-class example for RWA agent workflows would help future builders move faster.

## Suggested Improvements

- Provide a minimal official TypeScript client for signing `X-OC-*` requests.
- Add copy-paste examples for quote -> swap -> simulate on BSC tokenized stocks.
- Document the exact swap response transaction shape for each vendor.
- Add a rate-limit header or retry guidance to simplify local development.
