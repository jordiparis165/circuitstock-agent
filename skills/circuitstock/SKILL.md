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

## Safety Rules

- Never broadcast automatically.
- Use BSC mainnet only.
- Use spot tokenized-stock routes only.
- Keep trade amounts small unless a human explicitly changes them.
- Treat missing allowance as a request to sign approval first, not as an execution failure.
