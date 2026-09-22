# Agent Studio and x402 Plan

CircuitStock is ready to be wrapped as a BNB Agent Studio runtime. The live app already exposes agent-safe HTTP tools and never broadcasts transactions automatically.

## Agent Identity

- Proposed agent name: `circuitstock-spread-agent`
- Chain: BSC mainnet for product calls, Agent Studio identity where supported.
- Identity target: ERC-8004 registration through BNB Agent Studio.

## Task Interface

ERC-8183-style task:

```json
{
  "task": "scan_tokenized_stock_spreads",
  "input": {
    "risk": "balanced",
    "maxTradeUsd": 10,
    "platforms": ["bstock", "ondo"],
    "tabs": [9, 4, 11, 12],
    "walletAddress": "0x..."
  }
}
```

Output is the `/api/agent/recommend/compact` payload: recommendation, reason, confidence, required user action, transaction preview, and no-broadcast flag.

## Autonomous Runtime

CircuitStock now includes a policy-gated watcher intended to mirror the shape of a managed Agent Studio runtime:

- `GET /api/watcher/status` shows enabled/running state, dry-run/live mode, kill switch, thresholds, budgets, whitelist and recent decisions.
- `POST /api/watcher/tick` manually runs one monitor loop for judge review.
- `POST /api/watcher/kill` and `POST /api/watcher/resume` control the kill switch.

The runtime remains dry-run by default. It will only record `would-execute` after whitelist, spread, score, liquidity, daily budget, cooldown, wallet and simulation checks pass. If `AUTO_MODE=live`, it still refuses execution until a real Agentic Wallet executor is wired, so the safety boundary remains intact.

## Natural Language Tool

`POST /api/agent/interpret`

Example:

```json
{
  "prompt": "Quote only: buy $10 of TSLA tokenized stock",
  "walletAddress": "0x..."
}
```

The server resolves the ticker, checks RWA search/profile/market data, prepares execution when needed, and returns a plain-language summary.

## x402 / b402 Commerce Hook

CircuitStock includes a demo payment-gated agent shape:

- Free tier: current spread scanner, quote-only preview, and natural-language prompt.
- Manifest: `GET /api/b402/manifest`.
- Payment-gated demo route: `POST /api/premium/signal`.
- Without payment header, the route returns `402 Payment Required` with amount, asset, chain, and next step.
- With hackathon demo header `x-demo-payment: paid`, it returns the premium signal and top monitored opportunities.

Example:

```bash
curl -X POST https://circuitstock-agent-api.onrender.com/api/premium/signal \
  -H "content-type: application/json" \
  -H "x-demo-payment: paid" \
  -d '{"risk":"balanced","maxTradeUsd":10,"platforms":["bstock"],"tabs":[9]}'
```

This is not production settlement. It is a judge-visible b402/x402-compatible route shape for Agent Studio commerce packaging.

## Safety Contract

- `broadcasts_transactions: false`
- `requires_user_signature: true`
- `spot_only: true`
- `chain: BSC mainnet`
- max default demo trade: `$10`
