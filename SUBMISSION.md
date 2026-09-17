# CircuitStock Agent Submission

## Links

- Live demo: add Vercel URL after deployment
- API: add Render URL after deployment
- Demo video: add video URL after recording
- Repository: https://github.com/jordiparis165/circuitstock-agent

## One-Liner

CircuitStock Agent scans BSC tokenized stocks for on-chain/reference spreads, prepares small rebalances with Binance Web3 quotes, builds approval and swap calldata, simulates the transaction, and leaves signing to the user wallet with no automatic broadcast.

## Judge Path

1. Open the live app.
2. Confirm market data is `live` or `cached`.
3. Pick a risk profile and max trade amount.
4. Click **Prepare execution** on an agent recommendation.
5. Review quote ID, vendor, price impact, approval calldata, swap calldata, simulation status, and no-broadcast checklist.
6. Optionally connect a wallet and try **Sign approval only** / **Sign swap only**.

## APIs Used

- RWA Data API: tokenized stock prices and reference prices.
- Trading API: aggregated quote and swap calldata.
- Transaction API: off-chain transaction simulation.
- Agent endpoint: compact recommendation for Agentic Wallet / BNB Agent Studio.

## Safety Boundary

CircuitStock never broadcasts transactions. It only prepares calldata, runs simulation, and lets the user wallet decide whether to sign.
