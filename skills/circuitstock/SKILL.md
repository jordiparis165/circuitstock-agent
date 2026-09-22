# CircuitStock Agent Skill

Use this skill to scan BSC tokenized stocks and prepare safe rebalance transactions through CircuitStock Agent.

## Tools

### scan_tokenized_stock_spreads

Call `POST /api/agent/recommend/compact`.

Input:

```json
{
  "risk": "balanced",
  "maxTradeUsd": 10,
  "platforms": ["bstock"],
  "tabs": [9],
  "walletAddress": "0x..."
}
```

Output:

- ranked recommendation
- confidence score
- required user action
- transaction preview
- cache status

### prepare_rebalance

Call `POST /api/execution/prepare`.

Input:

```json
{
  "symbol": "TSLAb",
  "side": "buy",
  "amountUsd": 10,
  "walletAddress": "0x..."
}
```

Output:

- selected quote
- approval transaction payload
- swap transaction payload
- simulation summary
- no-broadcast checklist

### premium_signal_demo

Call `POST /api/premium/signal`.

This is a b402/x402-compatible demo route for Agent Studio commerce packaging. It returns `402 Payment Required` unless the hackathon demo header `x-demo-payment: paid` is supplied. It never broadcasts and should only be used to show how a paid monitoring tool would wrap the same signal engine.

### dry_run_watcher_status

Call `GET /api/watcher/status`.

Use this to inspect the autonomous dry-run runtime: mode, kill switch, whitelist, spread threshold, liquidity floor, trade limits, daily budget, cooldown and recent decisions.

### dry_run_watcher_tick

Call `POST /api/watcher/tick`.

Use this to run one manual monitor iteration. A valid result is `would-execute`, `skipped`, `idle`, or `error`; it never broadcasts.

## Safety Rules

- Never broadcast automatically.
- Use BSC mainnet only.
- Use spot tokenized-stock routes only.
- Keep trade amounts small unless a human explicitly changes them.
- Treat missing allowance as a request to sign approval first, not as an execution failure.
