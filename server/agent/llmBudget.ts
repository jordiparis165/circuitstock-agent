// The deployed chat endpoint is public and spends someone's OpenAI credit on every call, so it
// is rate limited per IP and capped by a daily token budget. When the budget is gone the chat
// degrades to the deterministic tools rather than failing: the app stays usable for a judge.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = Number(process.env.LLM_RATE_LIMIT_PER_MIN ?? 10);
const DAILY_TOKEN_BUDGET = Number(process.env.LLM_DAILY_TOKEN_BUDGET ?? 120_000);

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let tokensUsedToday = 0;
let tokenDay = new Date().toISOString().slice(0, 10);

function rollDayIfNeeded() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== tokenDay) {
    tokenDay = today;
    tokensUsedToday = 0;
  }
}

export function checkRateLimit(ip: string): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export function tokenBudgetAvailable(): boolean {
  rollDayIfNeeded();
  return tokensUsedToday < DAILY_TOKEN_BUDGET;
}

export function recordTokens(used: number) {
  rollDayIfNeeded();
  if (Number.isFinite(used) && used > 0) tokensUsedToday += used;
}

export function budgetSnapshot() {
  rollDayIfNeeded();
  return { day: tokenDay, tokensUsedToday, dailyTokenBudget: DAILY_TOKEN_BUDGET, requestsPerMinutePerIp: MAX_REQUESTS_PER_WINDOW };
}

// Buckets are only useful for one window; drop stale ones so a long-running process with many
// visitors does not grow the map without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) if (now >= bucket.resetAt) buckets.delete(ip);
}, WINDOW_MS).unref();
