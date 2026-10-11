#!/usr/bin/env bash
# Hits every endpoint the UI depends on and prints a pass/fail line per route.
# Usage: scripts/audit-api.sh [base-url]   (default http://localhost:8787)
BASE="${1:-http://localhost:8787}"
pass=0; fail=0

probe() { # probe <method> <path> <jq-ish python expr on body> [json body]
  local method="$1" path="$2" expr="$3" body="${4:-}"
  local out code
  if [ -n "$body" ]; then
    out=$(curl -s -m 60 -w $'\n%{http_code}' -X "$method" "$BASE$path" -H "Content-Type: application/json" -d "$body")
  else
    out=$(curl -s -m 60 -w $'\n%{http_code}' -X "$method" "$BASE$path")
  fi
  code=$(printf '%s' "$out" | tail -1)
  local json; json=$(printf '%s' "$out" | sed '$d')
  local verdict
  verdict=$(printf '%s' "$json" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception as e: print('BAD JSON'); sys.exit()
try: print('OK' if ($expr) else 'ASSERT FAILED')
except Exception as e: print('ERR '+type(e).__name__)
" 2>/dev/null)
  if [ "$code" = "200" ] && [ "$verdict" = "OK" ]; then
    printf '  \033[32mPASS\033[0m %-6s %-34s\n' "$method" "$path"; pass=$((pass+1))
  else
    printf '  \033[31mFAIL\033[0m %-6s %-34s http=%s %s\n' "$method" "$path" "$code" "$verdict"; fail=$((fail+1))
  fi
}

echo "== Core =="
probe GET  /api/health                  "d['ok'] and 'sources' in d"
probe GET  /api/agent/status            "d['ok'] and 'llm' in d and 'budget' in d"
probe GET  /api/market/overview         "d['ok'] and len(d['heatmap'])>0"
probe GET  /api/settings                "d['ok'] and 'agent_enabled' in d['settings']"
probe GET  /api/portfolio               "d['ok'] and d['simulated'] is True"

echo "== Agent (LLM + deterministic) =="
probe POST /api/agent/action            "d['card']['type']=='simulated_buy' and len(d['card']['checks'])>0" '{"tool":"propose_buy","ticker":"AAPL","amount_usd":"50"}'
probe POST /api/agent/action            "d['card']['type']=='premium_check'" '{"tool":"get_premium","ticker":"NVDA"}'
probe POST /api/agent/action            "d['card']['type']=='rotation'" '{"tool":"propose_rotation"}'
probe POST /api/agent/action            "d['card']['type']=='settings_change'" '{"tool":"propose_setting_change","preset":"prudent"}'
probe POST /api/agent/chat              "'llm' in d and isinstance(d['llm']['available'],bool)" '{"message":"is AAPL expensive right now?"}'

echo "== Alerts / Plans =="
probe GET  /api/alerts                  "d['ok'] and isinstance(d['alerts'],list)"
probe GET  /api/plans                   "d['ok'] and isinstance(d['plans'],list)"

echo "== Agent part B / journal =="
probe GET  /api/agent/part-b/ledger     "d['ok'] and isinstance(d['decisions'],list)"
probe GET  /api/rebalance/suggestions   "d['ok'] and isinstance(d['suggestions'],list)"

echo "== Wallet Skills =="
probe GET  /api/skills/log              "d['ok'] and isinstance(d['calls'],list)"
probe GET  /api/skills/check            "d['ok'] and len(d['checks'])>0"

echo "== Opportunities =="
probe GET  /api/opportunities           "d['ok'] and 'newsEnabled' in d"

echo
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
