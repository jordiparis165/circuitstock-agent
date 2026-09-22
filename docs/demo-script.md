# Demo Script

Target length: under 4 minutes.

## 0:00 - 0:30: Problem

Tokenized equities trade on-chain while traditional reference markets have different hours and infrastructure. CircuitStock watches the on-chain/reference spread and prepares cautious actions.

## 0:30 - 1:10: Live Scanner

Open the dashboard. Show the live watchlist powered by Binance Web3 RWA Data API. Point out:

- tokenized stock symbol
- source platform
- on-chain price
- reference price
- spread in basis points
- liquidity-aware score

## 1:10 - 1:45: First Stock Flow

Use the **First stock flow**. Pick TSLA or NVDA, keep `$10`, and click **Preview buy**. Explain that a non-crypto-native user can start from a familiar stock, while the app still uses the agent engine behind the scenes.

## 1:45 - 2:20: Agent Recommendation

Show the right panel. The agent ranks actions by spread, liquidity, and market status. It uses small default trade sizing, requires simulation, and never broadcasts automatically.

## 2:20 - 3:10: Execution Preparation

Click **Prepare execution**.

Show the checklist:

- quote received
- approval calldata extracted
- swap calldata built
- transaction simulated
- no broadcast

Point out quote ID, vendor, price impact, approval target, and simulation feedback. If simulation says allowance is missing, explain that this is exactly why the app separates approval signing from swap signing.

## 3:10 - 3:35: Wallet Boundary

Connect wallet if available. Try **Sign/copy approval** and **Sign/copy swap**. Explain that wallet support may vary, but CircuitStock never broadcasts automatically and keeps the transaction payload inspectable.

## 3:35 - 4:00: Prize Fit

Mention:

- RWA Data API
- Trading API
- Transaction API
- Agent-friendly `/api/agent/recommend`
- Compact skill endpoint `/api/agent/recommend/compact`
- Natural-language endpoint `/api/agent/interpret`
- Dry-run watcher `/api/watcher/status` and `/api/watcher/tick`
- Thematic basket planner `/api/baskets/plan`
- Judge smoke test `/api/judge/smoke`
- b402 demo manifest `/api/b402/manifest`
- ready path for Agentic Wallet / Wallet Skills and BNB Agent Studio
