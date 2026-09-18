# Developer Experience Report

## Summary

CircuitStock Agent integrates Binance Web3 API modules for the BNB Hack: Tokenized Stocks Edition:

- RWA Data API for tokenized stock lists, reference prices, on-chain prices, market status, and liquidity.
- Market API for candle-derived volatility and momentum context.
- Trading API for cross-DEX quote, official approval transaction, swap calldata construction, and transaction status lookup.
- Transaction API for gas price, gas limit, and pre-trade simulation.
- Wallet API for balances and portfolio checks before recommending a signed action.

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
- `GET /api/v1/dex/market/rwa/underlying-profile`
- `GET /api/v1/dex/market/rwa/underlying-market`
- `GET /api/v1/dex/market/candles`
- `GET /api/v1/dex/aggregator/quote`
- `GET /api/v1/dex/aggregator/approve-transaction`
- `GET /api/v1/dex/aggregator/swap`
- `GET /api/v1/dex/aggregator/history`
- `GET /api/v1/dex/pre-transaction/gas-price`
- `POST /api/v1/dex/pre-transaction/gas-limit`
- `POST /api/v1/dex/pre-transaction/simulate`
- `GET /api/v1/dex/balance/all-token-balances-by-address`
- `GET /api/v1/dex/market/portfolio/overview`

## API Pitfalls

- The `/quote` result has a short-lived `quoteId`; `/swap` must be called quickly.
- The simulation endpoint may return `success: true` while the simulated execution status is `FAILED`, for example when ERC-20 allowance is missing. The app treats this as useful pre-trade feedback rather than a transport failure.
- RWA Data API calls can hit rate limits during rapid local iteration. CircuitStock uses a short 30-second cache for scanner data.
- Swap responses may include nested `tx` payloads rather than a top-level transaction object, so the app extracts transaction data defensively.
- During local testing, `POST /api/execution/prepare` successfully returned a quote, swap calldata and simulation. The simulation correctly caught `BEP20: transfer amount exceeds allowance`, which the UI now translates into an approval-first action.
- Some supporting endpoints can fail independently of the main quote/swap path depending on wallet state, token support, or parameter shape. CircuitStock records these as non-blocking `apiWarnings` and surfaces them in `/api/evidence`.
- Candlestick payload shapes are not assumed rigidly. CircuitStock extracts close/price fields defensively and uses them only as a signal layer, not as the source of execution truth.

## Tokenized Stock Specifics

- RWA token payloads include both `tokenPrice` and `referencePrice`, which is exactly what a spread scanner needs.
- `statusInfo` is useful for distinguishing normal trading from market-closed behavior.
- bStocks routes can involve multiple DEX hops through USDC, BTCB, ETH, USDT, and the target bStock.
- Simulation often reveals required approvals before users waste gas.
- Approval calldata is returned through Trading API `signatureData`; CircuitStock extracts this into an approval transaction that can be signed separately from the swap.
- Underlying profile and market endpoints are important for issuer/asset context, because tokenized securities are not only prices: market status, trading halts, attestations, and reference data quality matter.

## AI Stack Feedback

- The best Wallet Skills shape is two tools:
  - `scan_tokenized_stock_spreads`
- `prepare_rebalance`
- `prepare_rebalance` returns a compact `required_user_action` so agent runtimes can ask the user for approval before any signing.
- Agent Studio is a natural fit for persistent monitoring, especially if the runtime calls `/api/agent/recommend` on a schedule.
- A first-class example for RWA agent workflows would help future builders move faster.
- The compact endpoint now returns whether wallet checks, gas checks, and research context were loaded, so an Agent Studio runtime can decide whether to ask the user for more information before requesting a signature.

## Suggested Improvements

- Provide a minimal official TypeScript client for signing `X-OC-*` requests.
- Add copy-paste examples for quote -> swap -> simulate on BSC tokenized stocks.
- Document the exact swap response transaction shape for each vendor.
- Add a rate-limit header or retry guidance to simplify local development.
