# CircuitStock Agent Submission

## Links

- Live demo: https://circuitstock-agent.vercel.app
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
5. Review quote ID, vendor, price impact, wallet checks, official approval, gas checks, approval calldata, swap calldata, simulation status, and no-broadcast checklist.
6. Open **Agent Studio**, run the natural-language prompt, and verify it fills the same execution preview.
7. Optionally connect a wallet and try **Sign/copy approval** / **Sign/copy swap**.

## APIs Used

- RWA Data API: platforms, search, tokenized stock prices, reference prices, company profile and underlying market data.
- Market API: candle signal layer for volatility and momentum.
- Trading API: aggregated quote, official approval transaction, swap calldata and history lookup.
- Transaction API: gas price, gas limit and off-chain transaction simulation.
- Wallet API: balances and portfolio checks before user signing.
- Agent endpoints: compact recommendation and natural-language interpretation for Agentic Wallet / BNB Agent Studio.

## Safety Boundary

CircuitStock never broadcasts transactions. It only prepares calldata, runs simulation, and lets the user wallet decide whether to sign.
