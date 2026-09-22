# Developer Experience Report

## Summary

CircuitStock Agent integrates Binance Web3 APIs for the BNB Hack: Tokenized Stocks Edition. The production flow is:

1. Scan live RWA tokenized stocks on BSC.
2. Compare `tokenPrice` against `referencePrice`.
3. Score spread, liquidity, source, market status, volatility, and risk profile.
4. Resolve a stock prompt such as "buy $10 of TSLA".
5. Fetch a Trading API quote.
6. Fetch the official approval transaction.
7. Build swap calldata.
8. Check gas price and gas limit.
9. Simulate before signing.
10. Ask the user wallet to sign only; CircuitStock never broadcasts.

This directly targets the hackathon scoring mix: technical depth, product creativity, developer experience, and judge-friendly UX.

## What Worked Well

- RWA Data API is the strongest starting point for tokenized stocks. `tokenPrice`, `referencePrice`, `volume24H`, `statusInfo`, ticker, and platform data made the spread scanner possible without scraping or third-party data.
- Trading API quote responses include enough route metadata to build a judge-readable execution preview: `quoteId`, vendor, price impact, expected output, approve target, and route status.
- Transaction API simulation is useful even when the simulated transaction fails. It turns missing allowance or insufficient balance into a safe pre-flight message instead of a wasted on-chain attempt.
- Wallet API calls let the agent prove it checked balances/portfolio before asking for any signature.
- RWA search/profile/underlying-market endpoints make natural-language prompts much better: the agent can resolve "TSLA" and show company context before trade prep.

## Concrete Integration Notes

- Base URL used: `https://web3.binance.com/build`.
- Signature path must include `/build`. Signing only `/api/v1/...` produced invalid signature errors.
- Headers used for signed requests: `X-OC-APIKEY`, `X-OC-TIMESTAMP`, and `X-OC-SIGN`.
- Signature shape: Base64 HMAC-SHA256 over `timestamp + method + requestPath + body`.
- `GET` and `POST` must both be supported because quote/swap are GET-style calls while simulation/gas-limit use POST.
- Quote IDs are short-lived. CircuitStock builds swap calldata immediately after selecting a quote and displays a clean "quote expired" error when needed.
- Swap/approval responses can contain nested `signatureData`/`tx` objects. CircuitStock extracts EVM transaction fields defensively instead of assuming a single response shape.
- Simulation can return HTTP success while execution status is failed. CircuitStock reads the nested status/fail reason and maps it to messages such as "Needs USDC approval" or "Simulation failed: allowance missing".
- Some wallets do not support `eth_signTransaction`. The app now attempts raw signing, then falls back to copying/displaying the transaction payload with "No broadcast performed".
- Rapid local scans can trigger rate-limit behavior. CircuitStock has a short cache and a `fallback` scanner mode so the dashboard stays usable while still labeling non-live data.

## Endpoints Used

- `GET /api/v1/dex/market/rwa/tokens`
- `GET /api/v1/dex/market/rwa/price`
- `GET /api/v1/dex/market/rwa/platforms`
- `GET /api/v1/dex/market/rwa/search`
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

## Product Decisions

- Default demo size is `$10` to keep the live flow small and judge-safe.
- BSC mainnet only, spot only.
- No automatic broadcast exists in the backend or frontend.
- The frontend shows a complete execution checklist: live RWA data, quote, wallet check, approval API, approval calldata, swap calldata, gas estimate, research context, simulation, user signature only, and no broadcast.
- A "First stock flow" was added for non-crypto-native judges: pick TSLA/NVDA/MSFT/SPY, preview a buy, and see the same quote/simulate/sign boundary.
- Agent endpoints reuse the same engine as the UI, so Wallet Skills and Agent Studio do not rely on a separate code path.
- A dry-run watcher was added to demonstrate autonomous runtime behavior without crossing the signing/broadcast boundary. It has explicit whitelist, spread, score, liquidity, max trade, daily budget, slippage, cooldown and kill-switch controls.
- A basket planner was added because "one-tap thematic baskets" is one of the clearest non-crypto-native UX paths for tokenized stocks. It uses the same RWA scanner and marks legs as buy-ready only when the live spread supports it.
- A judge smoke-test endpoint was added so reviewers can verify health, market data, baskets, watcher, b402 and no-broadcast status in one call.

## Agent Studio and b402/x402 Notes

- `POST /api/agent/recommend/compact` returns a compact skill payload: recommendation, reason, confidence, required user action, transaction preview, cache status, and skills.
- `POST /api/agent/interpret` accepts plain-language prompts and returns parsed intent, RWA research, optional execution preview, and a spoken summary.
- `POST /api/ai/agent` adds an optional LLM reasoning layer using OpenAI Responses API when configured, with deterministic fallback when not configured.
- `GET /api/b402/manifest` exposes a payment-gated agent route shape.
- `POST /api/premium/signal` demonstrates a b402/x402-compatible `402 Payment Required` flow for premium monitoring. It is explicit demo mode and does not collect production payment.
- `skills/circuitstock/SKILL.md` and `skills/circuitstock/skill.json` document `scan_tokenized_stock_spreads`, `prepare_rebalance`, `plain_language_stock_prompt`, and `premium_signal_demo`.
- `GET /api/watcher/status` and `POST /api/watcher/tick` expose the autonomous dry-run monitor that Agent Studio could run on a schedule.
- Policy tests cover whitelist, daily budget and cooldown behavior with `npm run test`.

## Deployment Lessons

- Vercel originally tried to process Render config when the repo contained `render.yaml`; `.vercelignore` now excludes deployment-only files that Vercel does not need.
- Vercel production must set `VITE_API_BASE_URL` to the Render API URL, otherwise the static app calls `/api` on Vercel.
- Render free web services work for the demo, but cold starts can delay the first API call.
- Render root `/` returned 404 at first even though `/api/health` worked. The API now exposes a root JSON route with links to health, evidence, and agent endpoints.
- `render.yaml` now lists non-secret endpoint defaults; only API key and secret are supplied as Render secrets.

## Suggested Binance Improvements

- Publish a minimal official TypeScript client for signed Web3 API requests.
- Add an end-to-end tokenized stock example: RWA tokens -> quote -> approval -> swap -> gas -> simulate.
- Document exact response shapes for `signatureData` in approve/swap responses across vendors.
- Expose rate-limit headers and retry-after guidance.
- Provide a Wallet Skills / Agent Studio starter kit for RWA agents, including a no-broadcast signing boundary.

## Verification Snapshot

- Local build command: `npm run build`.
- Production API: `https://circuitstock-agent-api.onrender.com/api/health`.
- Production frontend: `https://circuitstock-agent.vercel.app`.
- Sanitized evidence endpoint: `GET /api/evidence`.
- Payment hook manifest: `GET /api/b402/manifest`.
- Demo payment route: `POST /api/premium/signal` with optional header `x-demo-payment: paid`.
- Dry-run watcher: `GET /api/watcher/status` and `POST /api/watcher/tick`.
- Thematic basket planner: `POST /api/baskets/plan`.
- Judge smoke test: `GET /api/judge/smoke`.
- AI reasoning copilot: `POST /api/ai/agent`.
