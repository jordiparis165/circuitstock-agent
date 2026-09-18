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

CircuitStock does not need paid calls for the demo, but the natural extension is:

- Free tier: current spread scanner and quote-only preview.
- Paid x402 call: persistent monitoring every N minutes, webhook alerts, or premium cross-protocol basket recommendations.
- Payment-gated route candidate: `/api/agent/recommend/compact`.

## Safety Contract

- `broadcasts_transactions: false`
- `requires_user_signature: true`
- `spot_only: true`
- `chain: BSC mainnet`
- max default demo trade: `$10`
