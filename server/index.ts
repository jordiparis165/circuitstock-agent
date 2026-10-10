import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import morgan from "morgan";
import {
  callBinanceGet,
  getAggregatorHistory,
  getBinanceApproveTransaction,
  getBinanceQuote,
  getBinanceSwap,
  getGasLimit,
  getGasPrice,
  getMarketCandles,
  getPortfolioOverview,
  getRwaPlatforms,
  getRwaUnderlyingMarket,
  getRwaUnderlyingProfile,
  getWalletBalances,
  searchRwaToken,
  simulateEvmTransaction
} from "./binanceWeb3";
import { runAiAgent } from "./aiAgent";
import { walletReadiness } from "./bscRpc";
import { config } from "./env";
import { setKilled, startWatcher, tick, watcherStatus, type WatcherDeps } from "./watcher";
import { getPolicy, updatePolicy } from "./policy";
import { getReferencePrices, referencePriceProvidersConfigured, startAlpacaStream, type ReferencePrice } from "./referencePrice";
import { computeSpread, isOutlier, isTradeable, normalizePerSharePrice, parseCandleCloses } from "./spread";
import { getToken, quoteTokens, tokenRegistry } from "./tokenRegistry";
import { loadSampleSnapshot } from "./agent/fixtures";
import { recentDecisions } from "./agent/ledger";
import { runAgentCycle } from "./agent/runner";
import { handleAgentChat, marketOverview } from "./agent/chatTools";
import { createAlert, deleteAlert, listAlerts, patchAlert, testAlert } from "./agent/alerts";
import { createPlan, deletePlan, listPlans, patchPlan, runPlan } from "./agent/plans";
import { readSettings, recentSettingsChanges, resetSettings, setAgentEnabled, updateSettings } from "./agent/settings";
import { recentSkillCalls } from "./skills/log";
import { auditToken, getOndoMarketStatus, listOndoTokens, queryTokenInfoDynamic } from "./skills/binanceSkills";
import universeData from "../config/universe.json" with { type: "json" };

const app = express();

const DEFAULT_SLIPPAGE_BPS = 50;
const MAX_SLIPPAGE_BPS = 1000;

/** Slippage in bps: request value, else SLIPPAGE_BPS env, else 50. Clamped to 1..1000. */
function resolveSlippageBps(requested?: unknown): number {
  const value = Number(requested ?? config.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_SLIPPAGE_BPS;
  return Math.min(MAX_SLIPPAGE_BPS, Math.round(value));
}

const port = Number(process.env.PORT ?? 8787);
const rwaCache = new Map<string, { expiresAt: number; tokens: RwaToken[] }>();
const apiEvidence: ApiEvidence[] = [];

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "circuitstock-agent-api",
    health: "/api/health",
    evidence: "/api/evidence",
    agent: "/api/agent/recommend/compact",
    agentChat: "/api/agent/chat",
    agentPartB: "/api/agent/part-b/run",
    aiAgent: "/api/ai/agent",
    watcher: "/api/watcher/status",
    walletReadiness: "/api/wallet/readiness/:address",
    baskets: "/api/baskets",
    readiness: "/api/judge/readiness",
    smoke: "/api/judge/smoke",
    docs: "https://github.com/jordiparis165/circuitstock-agent"
  });
});

app.post("/api/agent/chat", async (req, res) => {
  try {
    res.json(await handleAgentChat(String(req.body?.message ?? "")));
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Agent chat failed." });
  }
});

app.get("/api/settings", (_req, res) => {
  res.json({ ok: true, settings: readSettings(), changes: recentSettingsChanges(10) });
});

app.put("/api/settings", (req, res) => {
  const body = req.body ?? {};
  const settings = body.reset ? resetSettings(body.preset, "user") : updateSettings(body, "user");
  res.json({ ok: true, settings, changes: recentSettingsChanges(10) });
});

app.post("/api/settings/kill", (req, res) => {
  res.json({ ok: true, settings: setAgentEnabled(req.body?.enabled === true, "kill-switch") });
});

app.get("/api/market/overview", (_req, res) => {
  res.json(marketOverview());
});

app.get("/api/portfolio", (_req, res) => {
  res.json({
    ok: true,
    simulated: true,
    holdings: [],
    message: "Simulated portfolio is empty until the user confirms a simulated plan or rotation."
  });
});

app.get("/api/rebalance/suggestions", async (_req, res) => {
  const decision = await runAgentCycle({ snapshot: loadSampleSnapshot(), requestId: `suggestion-${Date.now()}` });
  res.json({ ok: true, simulated: true, suggestions: [decision] });
});

app.post("/api/rebalance/confirm", (req, res) => {
  res.json({
    ok: true,
    simulated: true,
    message: "Simulated confirmation recorded. No signature and no broadcast were performed.",
    requestId: req.body?.requestId ?? crypto.randomUUID()
  });
});

app.get("/api/alerts", (_req, res) => res.json({ ok: true, alerts: listAlerts() }));
app.post("/api/alerts", (req, res) => {
  try {
    res.json({ ok: true, alert: createAlert(req.body ?? {}) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Alert create failed." });
  }
});
app.patch("/api/alerts/:id", (req, res) => {
  const alert = patchAlert(req.params.id, req.body ?? {});
  res.status(alert ? 200 : 404).json(alert ? { ok: true, alert } : { ok: false, error: "Alert not found." });
});
app.delete("/api/alerts/:id", (req, res) => res.json({ ok: deleteAlert(req.params.id) }));
app.post("/api/alerts/:id/test", (req, res) => {
  try {
    res.json({ ok: true, trigger: testAlert(req.params.id) });
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : "Alert test failed." });
  }
});

app.get("/api/plans", (_req, res) => res.json({ ok: true, plans: listPlans() }));
app.post("/api/plans", (req, res) => res.json({ ok: true, plan: createPlan(req.body ?? {}) }));
app.patch("/api/plans/:id", (req, res) => {
  const plan = patchPlan(req.params.id, req.body ?? {});
  res.status(plan ? 200 : 404).json(plan ? { ok: true, plan } : { ok: false, error: "Plan not found." });
});
app.delete("/api/plans/:id", (req, res) => res.json({ ok: deletePlan(req.params.id) }));
app.post("/api/plans/:id/run", (req, res) => {
  try {
    res.json({ ok: true, ...runPlan(req.params.id) });
  } catch (error) {
    res.status(404).json({ ok: false, error: error instanceof Error ? error.message : "Plan run failed." });
  }
});

app.get("/api/opportunities", async (_req, res) => {
  res.json({ ok: true, newsEnabled: false, reason: "News source not verified on the free plan.", overview: marketOverview() });
});

app.get("/api/skills/log", (req, res) => {
  res.json({ ok: true, calls: recentSkillCalls(Number(req.query.limit) || 25) });
});

app.get("/api/skills/check", async (_req, res) => {
  const results = await Promise.allSettled([
    getOndoMarketStatus(),
    listOndoTokens(),
    auditToken("56", "0x0000000000000000000000000000000000000000"),
    queryTokenInfoDynamic("56", "0x0000000000000000000000000000000000000000")
  ]);
  res.json({
    ok: true,
    checks: results.map((result, index) => ({
      skill: ["binance-tokenized-securities-info:market", "binance-tokenized-securities-info:list", "query-token-audit", "query-token-info"][index],
      ok: result.status === "fulfilled",
      error: result.status === "rejected" ? String(result.reason) : undefined
    })),
    calls: recentSkillCalls(10)
  });
});

app.get("/api/agent/part-b/ledger", (req, res) => {
  res.json({
    ok: true,
    mode: process.env.TRADING_MODE === "live" ? "live-disabled-by-guardrail" : "paper",
    decisions: recentDecisions(Number(req.query.limit) || 25)
  });
});

app.post("/api/agent/part-b/run", async (req, res) => {
  try {
    const snapshot = req.body?.snapshot ?? loadSampleSnapshot();
    const decision = await runAgentCycle({
      snapshot,
      requestId: req.body?.requestId,
      spentTodayUsd: req.body?.spentTodayUsd,
      openExposureUsd: req.body?.openExposureUsd,
      inFlightPairs: req.body?.inFlightPairs,
      lastTradeAtByPair: req.body?.lastTradeAtByPair
    });
    res.json({ ok: true, decision });
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "Agent Part B failed." });
  }
});

type MarketQuote = {
  symbol: string;
  name: string;
  tokenSource: "bStocks" | "Ondo";
  onchainPrice: number;
  referencePrice: number;
  spreadBps: number;
  liquidityUsd: number;
  marketWindow: "open" | "closed" | "pre-market" | "after-hours";
  contractReady: boolean;
  // 1 unless the token bundles several underlying shares (see RwaToken.tokenToShareRatio).
  // onchainPrice is already normalized per-share; this is only surfaced so the UI can explain why.
  shareRatio: number;
  // Binance's own /rwa/tokens referencePrice, kept only as a secondary display value - it is
  // DERIVED from tokenPrice (confirmed empirically), not an independent arbitrage signal.
  binanceReferencePrice?: number;
  // Set once an independent reference (Alpaca/Finnhub) has been applied; absent = this quote still
  // only has Binance's derived reference and should not be treated as a real spread signal.
  referenceSource?: "alpaca" | "finnhub";
  referenceStale?: boolean;
  // Independent market-open signal (from the reference feed's own clock), distinct from Binance's
  // own marketWindow. Unknown is treated as closed (fail safe) - see spread.ts isTradeable().
  independentMarketOpen?: boolean;
};

type RwaToken = {
  tokenContractAddress: string;
  platformId: "bstock" | "ondo" | string;
  tokenName: string;
  tokenSymbol: string;
  decimals: string;
  underlyingTicker: string;
  underlyingName: string;
  tokenPrice: string;
  referencePrice: string;
  // How many underlying shares one token represents (e.g. "10" means 1 token = 10 shares). Almost
  // always ~1, but a handful of Ondo tokens bundle multiple shares per token - tokenPrice must be
  // divided by this before comparing against referencePrice (which is always per-share), or the
  // computed spread is bogus (e.g. NFLXon: tokenPrice $6757 / ratio 10 = $675.7, matching referencePrice).
  tokenToShareRatio?: string;
  volume24H: string | null;
  statusInfo?: {
    openState?: boolean;
    reasonCode?: string | null;
  };
};

type Opportunity = MarketQuote & {
  tokenAddress: string;
  decimals: number;
  score: number;
  direction: "buy" | "trim" | "watch";
  reason: string;
};

type AgentAction = {
  symbol: string;
  action: "buy" | "trim" | "watch";
  reason: string;
  simulatedUsd: number;
  score: number;
  tokenAddress: string;
};

type CacheStatus = "live" | "cached" | "fallback";

type RwaTokenResult = {
  cacheStatus: CacheStatus;
  tokens: RwaToken[];
};

type ApiEvidence = {
  module: string;
  endpoint: string;
  status: "ok" | "failed";
  latencyMs: number;
  at: string;
  note?: string;
};

type BasketTheme = "magnificent-7" | "ai-chips" | "etf" | "buffett";

const basketThemes: Record<BasketTheme, { label: string; tab: number; thesis: string }> = {
  "magnificent-7": {
    label: "Magnificent 7",
    tab: 9,
    thesis: "Large-cap tech stock exposure with spread-aware BSC execution."
  },
  "ai-chips": {
    label: "AI Chips",
    tab: 4,
    thesis: "Semiconductor and AI infrastructure basket using tokenized stocks."
  },
  etf: {
    label: "ETF Core",
    tab: 11,
    thesis: "Simple diversified ETF-style tokenized equity starter basket."
  },
  buffett: {
    label: "Buffett Portfolio",
    tab: 12,
    thesis: "Value-oriented tokenized stock basket for slower rebalancing."
  }
};

const seedQuotes: Omit<MarketQuote, "spreadBps" | "contractReady" | "shareRatio">[] = [
  {
    symbol: "TSLAb",
    name: "Tesla bStock",
    tokenSource: "bStocks",
    onchainPrice: 421.61,
    referencePrice: 424.75,
    liquidityUsd: 1140000,
    marketWindow: "closed"
  },
  {
    symbol: "SPYON",
    name: "S&P 500 tokenized exposure",
    tokenSource: "Ondo",
    onchainPrice: 649.12,
    referencePrice: 648.72,
    liquidityUsd: 1890000,
    marketWindow: "open"
  },
  {
    symbol: "NVDAb",
    name: "NVIDIA bStock",
    tokenSource: "bStocks",
    onchainPrice: 181.84,
    referencePrice: 180.91,
    liquidityUsd: 1560000,
    marketWindow: "pre-market"
  }
];

async function measured<T>(module: string, endpoint: string, note: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    apiEvidence.unshift({
      module,
      endpoint,
      status: "ok",
      latencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
      note
    });
    apiEvidence.splice(24);
    return result;
  } catch (error) {
    apiEvidence.unshift({
      module,
      endpoint,
      status: "failed",
      latencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
      note: normalizeApiError(error as Error & { status?: number; body?: string }).kind
    });
    apiEvidence.splice(24);
    throw error;
  }
}

function jitter(value: number, symbol: string): number {
  const minute = Math.floor(Date.now() / 60000);
  const hash = crypto.createHash("sha256").update(`${symbol}:${minute}`).digest();
  const ratio = (hash[0] / 255 - 0.5) / 80;
  return Number((value * (1 + ratio)).toFixed(2));
}

function getQuotes(): MarketQuote[] {
  return seedQuotes.map((quote) => {
    const onchainPrice = jitter(quote.onchainPrice, quote.symbol);
    const spreadBps = Math.round(((onchainPrice - quote.referencePrice) / quote.referencePrice) * 10000);
    const token = getToken(quote.symbol);
    return { ...quote, onchainPrice, spreadBps, shareRatio: 1, contractReady: Boolean(token?.address && quoteTokens.usdc.address) };
  });
}

function toMarketWindow(token: RwaToken): MarketQuote["marketWindow"] {
  if (token.statusInfo?.openState) return "open";
  if (token.statusInfo?.reasonCode === "PRE_MARKET") return "pre-market";
  if (token.statusInfo?.reasonCode === "AFTER_HOURS") return "after-hours";
  return "closed";
}

async function getLiveMarket(platforms: string[], tabs: number[]): Promise<{ cacheStatus: CacheStatus; quotes: MarketQuote[] }> {
  const { cacheStatus, tokens } = await fetchMarketTokens(platforms, tabs);
  const derived = tokensToOpportunities(tokens);

  // Prefer the independent-reference view once it's actually usable (ALPACA_KEY/FINNHUB_KEY set
  // and config/universe.json populated via scripts/build-universe.ts). Until then, fall back to
  // the Binance-derived heuristic rather than showing an empty table - its `reason` text already
  // says plainly that it isn't an independent signal.
  const providers = referencePriceProvidersConfigured();
  if ((providers.alpaca || providers.finnhub) && universeBySymbol.size > 0) {
    const repriced = await applyIndependentReference(derived);
    if (repriced.length > 0) return { cacheStatus, quotes: repriced };
  }
  return { cacheStatus, quotes: derived };
}

// Sector/tab is a bStocks-only categorization; when other platforms are mixed in (e.g. the "All"
// preview) it only gets applied to the bStocks slice so it doesn't wrongly filter Ondo.
async function fetchMarketTokens(platforms: string[], tabs: number[]): Promise<RwaTokenResult> {
  const otherPlatforms = platforms.filter((platform) => platform !== "bstock");
  const [bstockResult, otherResult] = await Promise.all([
    platforms.includes("bstock") ? fetchRwaTokens(["bstock"], tabs) : Promise.resolve<RwaTokenResult>({ cacheStatus: "live", tokens: [] }),
    otherPlatforms.length > 0 ? fetchRwaTokens(otherPlatforms, []) : Promise.resolve<RwaTokenResult>({ cacheStatus: "live", tokens: [] })
  ]);
  const statuses = [bstockResult.cacheStatus, otherResult.cacheStatus];
  const cacheStatus: CacheStatus = statuses.includes("fallback") ? "fallback" : statuses.includes("cached") ? "cached" : "live";
  return { cacheStatus, tokens: [...bstockResult.tokens, ...otherResult.tokens] };
}

async function fetchRwaTokens(platforms = ["bstock"], tabs = [9]): Promise<RwaTokenResult> {
  const cacheKey = `${platforms.sort().join(",")}:${tabs.sort().join(",")}`;
  const cached = rwaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { cacheStatus: "cached", tokens: cached.tokens };

  const tabFilters = tabs.length > 0 ? tabs : [undefined];
  const apiPlatformIds = platforms.map((platformKey) => PLATFORM_API_IDS[platformKey]).filter((value): value is string => Boolean(value));
  const calls = apiPlatformIds.flatMap((platformId) =>
    tabFilters.map((tabId) =>
      measured("RWA Data API", config.rwaTokensPath, `platform=${platformId} tab=${tabId ?? "all"}`, () =>
        callBinanceGet<{ data?: RwaToken[] }>(config.rwaTokensPath, {
          binanceChainId: 56,
          platformId,
          tabId
        })
      )
    )
  );
  let responses: Array<{ data?: RwaToken[] }>;
  try {
    responses = await Promise.all(calls);
  } catch (error) {
    if (cached) return { cacheStatus: "cached", tokens: cached.tokens };
    return { cacheStatus: "fallback", tokens: fallbackRwaTokens().filter((token) => apiPlatformIds.includes(token.platformId)) };
  }
  const seen = new Set<string>();
  const tokens = responses.flatMap((response) => response.data ?? []).filter((token) => {
    const key = token.tokenContractAddress.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  rwaCache.set(cacheKey, { expiresAt: Date.now() + 30000, tokens });
  return { cacheStatus: "live", tokens };
}

function fallbackRwaTokens(): RwaToken[] {
  return seedQuotes.map((quote) => {
    const token = getToken(quote.symbol);
    const onchainPrice = jitter(quote.onchainPrice, quote.symbol);
    return {
      tokenContractAddress: token?.address ?? `0x${crypto.createHash("sha256").update(quote.symbol).digest("hex").slice(0, 40)}`,
      platformId: quote.tokenSource === "Ondo" ? "ondo" : "bstock",
      tokenName: quote.name,
      tokenSymbol: quote.symbol,
      decimals: String(token?.decimals ?? 18),
      underlyingTicker: token?.ticker ?? quote.symbol.replace(/[bx]$/i, ""),
      underlyingName: quote.name,
      tokenPrice: String(onchainPrice),
      referencePrice: String(quote.referencePrice),
      volume24H: String(quote.liquidityUsd),
      statusInfo: { openState: quote.marketWindow === "open", reasonCode: quote.marketWindow.toUpperCase() }
    };
  });
}

/**
 * Builds the opportunity list from Binance's own derived referencePrice. This stays as a cheap
 * secondary/display heuristic (used by baskets/strategy/compact-agent-recommend); the Monitor
 * table and the autonomous watcher go through applyIndependentReference() instead, which is the
 * one with a trustworthy spread signal - see docs/dx-report-notes.md for why.
 */
function tokensToOpportunities(tokens: RwaToken[]): Opportunity[] {
  return tokens
    .map((token) => {
      const onchainPrice = normalizePerSharePrice(token.tokenPrice, token.tokenToShareRatio);
      if (onchainPrice === null) return null;
      const spread = computeSpread(onchainPrice, token.referencePrice);
      if (!spread || isOutlier(spread.spreadPct)) return null;

      const liquidityUsd = Number(token.volume24H ?? 0);
      const open = token.statusInfo?.openState === true;
      const liquidityScore = Math.min(40, Math.log10(Math.max(liquidityUsd, 1)) * 5);
      // Closed market = penalized, not rewarded (used to be inverted: 20 for closed vs 10 for open).
      const statusScore = open ? 20 : 5;
      const score = Math.round(Math.abs(spread.spreadBps) * 1.2 + liquidityScore + statusScore);
      // No independent reference on this path yet, so never claim a firm buy/trim - always "watch".
      // This also means a closed market never gets mislabeled as a live opportunity.
      const direction: Opportunity["direction"] = open ? spread.direction : "watch";

      const opportunity: Opportunity = {
        symbol: token.tokenSymbol,
        name: token.underlyingName || token.tokenName,
        tokenSource: platformSourceLabel(token.platformId),
        onchainPrice,
        referencePrice: Number(token.referencePrice),
        binanceReferencePrice: Number(token.referencePrice),
        spreadBps: spread.spreadBps,
        liquidityUsd,
        shareRatio: Number(token.tokenToShareRatio),
        marketWindow: toMarketWindow(token),
        contractReady: Boolean(token.tokenContractAddress && quoteTokens.usdc.address),
        tokenAddress: token.tokenContractAddress,
        decimals: Number(token.decimals || 18),
        score,
        direction,
        reason:
          !open
            ? "Underlying market is closed - watch only, not acted on."
            : direction === "buy"
              ? "Token trades below Binance's derived reference with sufficient 24h liquidity (not an independent signal)."
              : direction === "trim"
                ? "Token trades above Binance's derived reference; trim or route into a cheaper exposure (not an independent signal)."
                : "Spread is tight; keep monitoring until drift clears the threshold."
      };
      return opportunity;
    })
    .filter((item): item is Opportunity => item !== null)
    .sort((a, b) => b.score - a.score);
}

type UniverseEntry = { symbol: string; underlyingTicker: string; platformId: string; tokenContractAddress: string; liquidityUsd: number };
const universeBySymbol = new Map<string, UniverseEntry>(
  ((universeData as { tokens: UniverseEntry[] }).tokens ?? []).map((entry) => [entry.symbol.toUpperCase(), entry])
);

/**
 * Re-prices a list of opportunities against the independent reference feed (Alpaca/Finnhub),
 * scoped to the curated universe (config/universe.json - the most liquid tokens that are also
 * covered by a real equity data feed). Tokens outside the universe are dropped: without an
 * independent reference there is no trustworthy spread to show or trade on.
 */
async function applyIndependentReference(opportunities: Opportunity[]): Promise<Opportunity[]> {
  const inUniverse = opportunities.filter((item) => universeBySymbol.has(item.symbol.toUpperCase()));
  if (inUniverse.length === 0) return [];

  const tickers = inUniverse.map((item) => universeBySymbol.get(item.symbol.toUpperCase())!.underlyingTicker);
  const references = await getReferencePrices(tickers);

  const repriced: Opportunity[] = [];
  for (const item of inUniverse) {
    const entry = universeBySymbol.get(item.symbol.toUpperCase())!;
    const reference = references.get(entry.underlyingTicker.toUpperCase());
    if (!reference) continue; // no usable independent reading this cycle - skip rather than guess

    const spread = computeSpread(item.onchainPrice, reference.price);
    if (!spread || isOutlier(spread.spreadPct)) continue;

    const tradeable = isTradeable(reference.marketOpen) && !reference.stale;
    const liquidityScore = Math.min(40, Math.log10(Math.max(item.liquidityUsd, 1)) * 5);
    const statusScore = tradeable ? 20 : 5; // closed/stale markets are penalized, not rewarded (was inverted before)
    const score = Math.round(Math.abs(spread.spreadBps) * 1.2 + liquidityScore + statusScore);
    const direction: Opportunity["direction"] = tradeable ? spread.direction : "watch";

    repriced.push({
      ...item,
      binanceReferencePrice: item.referencePrice,
      referencePrice: reference.price,
      referenceSource: reference.source,
      referenceStale: reference.stale,
      independentMarketOpen: reference.marketOpen,
      spreadBps: spread.spreadBps,
      score,
      direction,
      reason: !tradeable
        ? reference.stale
          ? "Reference price is stale - not acting on it."
          : "Underlying market is closed - not acting on it."
        : direction === "buy"
          ? "Token trades below an independent reference price with sufficient 24h liquidity."
          : direction === "trim"
            ? "Token trades above an independent reference price; trim or route into a cheaper exposure."
            : "Spread is tight against the independent reference; keep monitoring."
    });
  }

  return repriced.sort((a, b) => b.score - a.score);
}

async function getTokenBySymbol(
  symbol: string
): Promise<{ symbol: string; address: string; decimals: number; name: string; underlyingTicker?: string } | null> {
  const local = getToken(symbol);
  for (const cached of rwaCache.values()) {
    const found = cached.tokens.find((token) => token.tokenSymbol.toLowerCase() === symbol.toLowerCase());
    if (found) {
      return {
        symbol: found.tokenSymbol,
        address: found.tokenContractAddress,
        decimals: Number(found.decimals || 18),
        name: found.underlyingName || found.tokenName,
        underlyingTicker: found.underlyingTicker
      };
    }
  }
  if (local?.address) {
    const inferredTicker = local.symbol.replace(/B$/i, "").replace(/x$/i, "");
    return { symbol: local.symbol, address: local.address, decimals: local.decimals, name: local.name, underlyingTicker: inferredTicker };
  }
  const { tokens } = await fetchRwaTokens(SUPPORTED_PLATFORMS, [9, 4, 11]);
  const found = tokens.find((token) => token.tokenSymbol.toLowerCase() === symbol.toLowerCase());
  if (!found) return null;
  return {
    symbol: found.tokenSymbol,
    address: found.tokenContractAddress,
    decimals: Number(found.decimals || 18),
    name: found.underlyingName || found.tokenName,
    underlyingTicker: found.underlyingTicker
  };
}

// Internal platform keys used across the UI/API params, mapped to the platformId value the
// Binance Web3 RWA Data API actually expects. Binance only exposes bstock/ondo today (confirmed
// via GET /api/rwa/platforms) - xStocks isn't a real platform there yet, so it isn't offered here.
const PLATFORM_API_IDS: Record<string, string> = {
  bstock: "bstock",
  ondo: "ondo"
};

const SUPPORTED_PLATFORMS = Object.keys(PLATFORM_API_IDS);

function platformSourceLabel(platformId: string): MarketQuote["tokenSource"] {
  return platformId === PLATFORM_API_IDS.ondo ? "Ondo" : "bStocks";
}

function toArray(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (typeof input === "string" && input.length > 0) return input.split(",");
  if (input === undefined || input === null) return [];
  return [input];
}

function normalizePlatforms(input: unknown): string[] {
  const raw = toArray(input)
    .map(String)
    .map((value) => value.trim().toLowerCase());
  if (raw.includes("all")) return [...SUPPORTED_PLATFORMS];
  const values = raw.filter((platform) => SUPPORTED_PLATFORMS.includes(platform));
  return values.length > 0 ? values : ["bstock"];
}

function normalizeTabs(input: unknown): number[] {
  const values = toArray(input)
    .map(Number)
    .filter((tab) => Number.isInteger(tab) && tab > 0);
  return values.length > 0 ? values : [9, 4, 11];
}

function parsePlainLanguageIntent(text: string) {
  const normalized = text.trim();
  const upper = normalized.toUpperCase();
  const amountMatch = normalized.match(/(?:\$|USD|USDT|USDC)?\s*(\d+(?:\.\d+)?)/i);
  const amountUsd = amountMatch ? Math.min(100, Math.max(1, Number(amountMatch[1]))) : 10;
  const side = /\b(sell|trim|reduce|exit)\b/i.test(normalized) ? "sell" : "buy";
  const quoteOnly = /\b(quote|estimate|how much|preview|dry[- ]?run)\b/i.test(normalized);
  const researchOnly = /\b(research|price|status|profile|available|tradable|trading|list)\b/i.test(normalized) && !/\b(buy|sell|swap)\b/i.test(normalized);
  const ticker =
    (upper.match(/\b[A-Z]{2,5}B\b/)?.[0] ??
      upper.match(/\b(AAPL|MSFT|NVDA|TSLA|IBM|QCOM|SPY|QQQ|NOK|TSM|GOOG|META|AMZN)\b/)?.[0] ??
      "TSLA") + (upper.match(/\b[A-Z]{2,5}B\b/) ? "" : "B");
  return { text: normalized, symbol: ticker, side: side as "buy" | "sell", amountUsd, quoteOnly, researchOnly };
}

function pickQuote(data: unknown): Record<string, unknown> | null {
  const payload = data as { data?: unknown };
  const quotes = Array.isArray(payload.data) ? payload.data : Array.isArray(data) ? data : [];
  return (quotes.find((quote) => (quote as { isBest?: boolean }).isBest) ?? quotes[0] ?? null) as Record<string, unknown> | null;
}

function pickEvmTx(data: unknown): { from?: string; to: string; value?: string; data?: string; gas?: string } | null {
  const payload = data as { data?: unknown };
  const root = (payload.data ?? data) as Record<string, unknown>;
  const candidates = [
    root.swapTransaction,
    root.transaction,
    root.tx,
    root.evmTx,
    Array.isArray(root) ? root[0] : undefined
  ] as unknown[];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const tx = candidate as Record<string, unknown>;
    if (typeof tx.to === "string") {
      return {
        from: typeof tx.from === "string" ? tx.from : undefined,
        to: tx.to,
        value: typeof tx.value === "string" ? tx.value : "0",
        data: typeof tx.data === "string" ? tx.data : "0x",
        gas: typeof tx.gas === "string" ? tx.gas : undefined
      };
    }
  }
  if (typeof root.to === "string") {
    return {
      from: typeof root.from === "string" ? root.from : undefined,
      to: root.to,
      value: typeof root.value === "string" ? root.value : "0",
      data: typeof root.data === "string" ? root.data : "0x",
      gas: typeof root.gas === "string" ? root.gas : undefined
    };
  }
  return null;
}

function parseSignatureData(data: unknown, walletAddress?: string): { approvalTx: Record<string, string> | null; raw: unknown[] } {
  const payload = data as { data?: unknown };
  const root = (payload.data ?? data) as Record<string, unknown>;
  const tx = (root.tx ?? root.swapTransaction ?? root.transaction ?? root.evmTx ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(tx.signatureData) ? tx.signatureData : Array.isArray(root.signatureData) ? root.signatureData : [];

  for (const item of raw) {
    let parsed: unknown;
    try {
      parsed = typeof item === "string" ? JSON.parse(item) : item;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const approval = parsed as Record<string, unknown>;
    if (typeof approval.approveContract === "string" && typeof approval.approveTxCalldata === "string") {
      return {
        raw,
        approvalTx: {
          from: walletAddress ?? "",
          to: approval.approveContract,
          value: "0",
          data: approval.approveTxCalldata
        }
      };
    }
  }

  return { approvalTx: null, raw };
}

function summarizeSimulation(simulation: unknown) {
  const result = simulation as { ok?: boolean; data?: { data?: { status?: string; failReason?: string } } };
  const status = result.data?.data?.status ?? (result.ok ? "UNKNOWN" : "UNAVAILABLE");
  const failReason = result.data?.data?.failReason ?? "";
  const lowerReason = failReason.toLowerCase();

  if (lowerReason.includes("allowance")) {
    return {
      status,
      failReason,
      humanStatus: "Simulation failed: allowance missing.",
      nextRequiredAction: "Sign approval only, then prepare the swap again.",
      severity: "action-required"
    };
  }

  if (lowerReason.includes("balance")) {
    return {
      status,
      failReason,
      humanStatus: "Simulation failed: insufficient balance.",
      nextRequiredAction: "Fund the wallet or lower the trade amount.",
      severity: "action-required"
    };
  }

  if (status === "SUCCESS") {
    return {
      status,
      failReason,
      humanStatus: "Simulation passed. Swap calldata is ready for wallet signing.",
      nextRequiredAction: "Review and sign swap only.",
      severity: "ready"
    };
  }

  return {
    status,
    failReason,
    humanStatus: failReason ? `Simulation returned: ${failReason}` : "Simulation payload returned by Binance Transaction API.",
    nextRequiredAction: "Review the transaction payload before signing.",
    severity: "review"
  };
}

function normalizeApiError(error: Error & { status?: number; body?: string }) {
  let code: number | undefined;
  let msg = error.message;
  try {
    const parsed = error.body ? JSON.parse(error.body) : null;
    code = parsed?.code;
    msg = parsed?.msg ?? msg;
  } catch {
    // Keep original message.
  }
  const lower = msg.toLowerCase();
  const kind =
    code === 42900 || lower.includes("rate limit")
      ? "rate_limit"
      : lower.includes("expired")
        ? "quote_expired"
        : lower.includes("allowance")
          ? "missing_allowance"
          : lower.includes("balance")
            ? "insufficient_balance"
            : "binance_api_error";

  return { kind, code, message: msg, status: error.status };
}

function actionFromOpportunity(opportunity: Opportunity, maxTradeUsd: number): AgentAction {
  return {
    symbol: opportunity.symbol,
    action: opportunity.direction,
    reason: opportunity.reason,
    simulatedUsd: Math.min(maxTradeUsd, Math.max(10, Math.round(opportunity.liquidityUsd * 0.00005))),
    score: opportunity.score,
    tokenAddress: opportunity.tokenAddress
  };
}

function normalizeBasketTheme(input: unknown): BasketTheme {
  const value = String(input ?? "ai-chips").toLowerCase();
  return value in basketThemes ? (value as BasketTheme) : "ai-chips";
}

async function buildBasketPlan(themeInput: unknown, amountUsdInput: unknown, platformsInput: unknown, riskInput: unknown) {
  const theme = normalizeBasketTheme(themeInput);
  const amountUsd = Math.min(250, Math.max(5, Number(amountUsdInput ?? 25)));
  const risk = riskInput === "aggressive" ? "aggressive" : "balanced";
  const platforms = normalizePlatforms(platformsInput);
  const preset = basketThemes[theme];
  const { cacheStatus, tokens } = await fetchRwaTokens(platforms, [preset.tab]);
  const opportunities = tokensToOpportunities(tokens);
  const sorted = [...opportunities].sort((a, b) => {
    const directionScore = (item: Opportunity) => (item.direction === "buy" ? 2 : item.direction === "watch" ? 1 : 0);
    return directionScore(b) - directionScore(a) || b.score - a.score;
  });
  const count = risk === "aggressive" ? 3 : 5;
  const legs = sorted.slice(0, count).map((item, index) => {
    const weight = index === 0 && risk === "aggressive" ? 0.5 : 1 / Math.min(count, sorted.length || 1);
    return {
      symbol: item.symbol,
      name: item.name,
      tokenSource: item.tokenSource,
      tokenAddress: item.tokenAddress,
      allocationUsd: Number((amountUsd * weight).toFixed(2)),
      weightPct: Number((weight * 100).toFixed(1)),
      action: item.direction === "buy" ? "buy" : "watch",
      spreadBps: item.spreadBps,
      liquidityUsd: item.liquidityUsd,
      score: item.score,
      reason:
        item.direction === "buy"
          ? "Favored because token is below reference price."
          : item.direction === "trim"
            ? "Included as watch-only because token is above reference price."
            : "Included for diversified exposure while spread is tight."
    };
  });
  const tradableUsd = legs.filter((leg) => leg.action === "buy").reduce((sum, leg) => sum + leg.allocationUsd, 0);

  return {
    ok: true,
    mode: "basket-plan",
    cacheStatus,
    theme,
    label: preset.label,
    thesis: preset.thesis,
    risk,
    amountUsd,
    platforms,
    chain: "BSC mainnet",
    spotOnly: true,
    broadcasted: false,
    requiredUserAction: "Review each leg, prepare execution per token, simulate, then sign in wallet only.",
    summary: `${preset.label} plan with ${legs.length} legs, ${currencyLike(tradableUsd)} currently marked buy-ready.`,
    legs
  };
}

function currencyLike(value: number): string {
  return `$${value.toFixed(2)}`;
}

function judgeReadiness() {
  return {
    ok: true,
    links: {
      repository: "https://github.com/jordiparis165/circuitstock-agent",
      frontend: "https://circuitstock-agent.vercel.app",
      api: "https://circuitstock-agent-api.onrender.com",
      docs: "https://github.com/jordiparis165/circuitstock-agent/blob/main/README.md"
    },
    checklist: [
      { item: "Public GitHub repository", status: "ready" },
      { item: "Vercel frontend deployed", status: "ready" },
      { item: "Render API deployed", status: "ready" },
      { item: "Binance Web3 API key server-side", status: config.apiKey && config.apiSecret ? "ready" : "missing" },
      { item: "BSC RPC wallet readiness checks", status: "ready" },
      { item: "RWA scan -> quote -> approval -> swap -> simulation flow", status: "ready" },
      { item: "No automatic broadcast", status: "ready" },
      { item: "Wallet Skills spec", status: "ready" },
      { item: "LLM AI agent endpoint with deterministic fallback", status: "ready" },
      { item: "Agent Studio dry-run watcher", status: "ready" },
      { item: "b402/x402 demo route", status: "ready" },
      { item: "DX report", status: "ready" },
      { item: "Demo video under four minutes", status: "todo" },
      { item: "Fresh screenshots", status: "todo" },
      { item: "Rotate shared credentials", status: "todo" }
    ]
  };
}

function compactError(result: unknown) {
  const payload = result as { ok?: boolean; error?: string; body?: string; status?: number };
  if (payload.ok !== false) return null;
  return normalizeApiError({ message: payload.error ?? "API call failed", body: payload.body, status: payload.status } as Error & {
    status?: number;
    body?: string;
  });
}

/**
 * `candles` here is the raw BinanceCallResult: `{ok, mode, endpoint, data: {code, msg, data: [...rows], ...} }`
 * (Binance's own envelope, one level deeper than the outer wrapper) - the actual candle rows live
 * at `.data.data`, not `.data`. Both call sites used to pass `.data` only, so parseCandleCloses
 * always received the envelope object instead of the row array.
 */
function summarizeCandles(candlesResult: unknown) {
  const envelope = (candlesResult as { data?: unknown } | null)?.data;
  const rows = (envelope as { data?: unknown } | null)?.data ?? envelope;
  const prices = parseCandleCloses(rows).slice(-24);
  if (prices.length < 2) {
    return { points: prices.length, volatilityBps: null, changeBps: null, signal: "insufficient_candles" };
  }
  const first = prices[0];
  const last = prices[prices.length - 1];
  const returns = prices.slice(1).map((price, index) => (price - prices[index]) / prices[index]);
  const mean = returns.reduce((sum, item) => sum + item, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item - mean) ** 2, 0) / returns.length;
  const volatilityBps = Math.round(Math.sqrt(variance) * 10000);
  const changeBps = Math.round(((last - first) / first) * 10000);
  return {
    points: prices.length,
    volatilityBps,
    changeBps,
    signal: Math.abs(changeBps) > 100 ? "momentum_active" : volatilityBps > 60 ? "volatile" : "calm"
  };
}

async function prepareExecution(
  symbol: string,
  side: "buy" | "sell",
  amountUsd: number,
  walletAddress?: string,
  slippageBps = resolveSlippageBps()
) {
  const token = await getTokenBySymbol(symbol);
  if (!token) {
    return { ok: false, mode: "unknown_token", error: `Unknown token symbol: ${symbol}` };
  }
  if (!quoteTokens.usdc.address) {
    return { ok: false, mode: "missing_contracts", error: "BSC_USDC_ADDRESS is missing." };
  }

  const amount = BigInt(Math.round(amountUsd * 10 ** quoteTokens.usdc.decimals)).toString();
  const fromTokenAddress = side === "buy" ? quoteTokens.usdc.address : token.address;
  const toTokenAddress = side === "buy" ? token.address : quoteTokens.usdc.address;
  const quote = await getBinanceQuote({ fromTokenAddress, toTokenAddress, amount, walletAddress, slippageBps });
  const selectedQuote = quote.ok ? pickQuote(quote.data) : null;
  const quoteId = typeof selectedQuote?.quoteId === "string" ? selectedQuote.quoteId : null;

  let swap = null;
  let evmTx = null;
  let approvalTx = null;
  let officialApproval = null;
  let signatureData: unknown[] = [];
  let simulation = null;
  let gasPrice = null;
  let gasLimit = null;
  let walletBalances = null;
  let portfolioOverview = null;
  let candles = null;
  let underlyingProfile = null;
  let underlyingMarket = null;
  const apiWarnings = [];

  const researchCalls = await Promise.allSettled([
    measured("Market API", config.marketCandlesPath, token.symbol, () => getMarketCandles(token.address)),
    measured("RWA Data API", config.rwaUnderlyingProfilePath, token.symbol, () => getRwaUnderlyingProfile(token.address)),
    measured("RWA Data API", config.rwaUnderlyingMarketPath, token.symbol, () => getRwaUnderlyingMarket(token.address))
  ]);
  candles = researchCalls[0].status === "fulfilled" ? researchCalls[0].value : null;
  underlyingProfile = researchCalls[1].status === "fulfilled" ? researchCalls[1].value : null;
  underlyingMarket = researchCalls[2].status === "fulfilled" ? researchCalls[2].value : null;
  for (const result of researchCalls) {
    if (result.status === "fulfilled") {
      const warning = compactError(result.value);
      if (warning) apiWarnings.push(warning);
    } else {
      apiWarnings.push(normalizeApiError(result.reason as Error & { status?: number; body?: string }));
    }
  }

  if (walletAddress) {
    const walletCalls = await Promise.allSettled([
      measured("Wallet API", config.walletAllBalancesPath, walletAddress, () => getWalletBalances(walletAddress)),
      measured("Wallet API", config.walletPortfolioOverviewPath, walletAddress, () => getPortfolioOverview(walletAddress))
    ]);
    walletBalances = walletCalls[0].status === "fulfilled" ? walletCalls[0].value : null;
    portfolioOverview = walletCalls[1].status === "fulfilled" ? walletCalls[1].value : null;
    for (const result of walletCalls) {
      if (result.status === "fulfilled") {
        const warning = compactError(result.value);
        if (warning) apiWarnings.push(warning);
      } else {
        apiWarnings.push(normalizeApiError(result.reason as Error & { status?: number; body?: string }));
      }
    }
  }

  if (quote.ok && quoteId && walletAddress) {
    const vendor = typeof selectedQuote?.vendorName === "string" ? selectedQuote.vendorName : undefined;
    officialApproval = await measured("Trading API", config.approvePath, "official approve transaction", () =>
      getBinanceApproveTransaction({ tokenAddress: fromTokenAddress, amount, walletAddress, vendor })
    );
    swap = await getBinanceSwap({ fromTokenAddress, toTokenAddress, amount, walletAddress, slippageBps, quoteId });
    evmTx = swap.ok ? pickEvmTx(swap.data) : null;
    const approval = swap.ok ? parseSignatureData(swap.data, walletAddress) : { approvalTx: null, raw: [] };
    approvalTx = approval.approvalTx;
    signatureData = approval.raw;
    if (evmTx) {
      const txWithFrom = { ...evmTx, from: evmTx.from ?? walletAddress };
      const txChecks = await Promise.allSettled([
        measured("Transaction API", config.gasPricePath, "gas price", () => getGasPrice()),
        measured("Transaction API", config.gasLimitPath, "gas limit", () => getGasLimit(txWithFrom)),
        measured("Transaction API", config.simulatePath, "pre-transaction simulation", () => simulateEvmTransaction(txWithFrom))
      ]);
      gasPrice = txChecks[0].status === "fulfilled" ? txChecks[0].value : null;
      gasLimit = txChecks[1].status === "fulfilled" ? txChecks[1].value : null;
      simulation = txChecks[2].status === "fulfilled" ? txChecks[2].value : null;
      for (const result of txChecks) {
        if (result.status === "fulfilled") {
          const warning = compactError(result.value);
          if (warning) apiWarnings.push(warning);
        } else {
          apiWarnings.push(normalizeApiError(result.reason as Error & { status?: number; body?: string }));
        }
      }
    }
  }
  const swapTx = evmTx ? { ...evmTx, from: evmTx.from ?? walletAddress } : null;
  const simulationSummary = simulation ? summarizeSimulation(simulation) : null;

  return {
    ok: quote.ok,
    mode: "prepared",
    request: { symbol, side, amountUsd, walletAddress },
    token,
    quote,
    selectedQuote,
    swap,
    approvalTx,
    officialApproval,
    signatureData,
    swapTx,
    evmTx: swapTx,
    gasPrice,
    gasLimit,
    walletSnapshot: {
      balances: walletBalances,
      portfolio: portfolioOverview
    },
    research: {
      candles,
      candleSummary: candles && "data" in candles ? summarizeCandles(candles) : null,
      underlyingProfile,
      underlyingMarket
    },
    apiWarnings,
    simulation,
    simulationSummary,
    humanStatus: simulationSummary?.humanStatus ?? (quote.ok ? "Quote ready. Connect a wallet to build and simulate calldata." : "Quote failed."),
    nextRequiredAction: simulationSummary?.nextRequiredAction ?? "Connect wallet and prepare execution.",
    checklist: {
      quote: quote.ok,
      approvalCalldata: Boolean(approvalTx),
      swapBuilt: Boolean(evmTx),
      simulated: Boolean(simulation?.ok),
      walletBalances: Boolean(walletBalances && (walletBalances as { ok?: boolean }).ok !== false),
      officialApproval: Boolean(officialApproval && (officialApproval as { ok?: boolean }).ok !== false),
      gasEstimated: Boolean(gasPrice || gasLimit),
      researchLoaded: Boolean(candles || underlyingProfile || underlyingMarket),
      requiresUserSignature: true,
      broadcasted: false
    }
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "circuitstock-agent",
    apiConfigured: Boolean(config.apiKey && config.apiSecret),
    apiKeyStatus: config.apiKey ? "configured" : "missing",
    quotePathConfigured: Boolean(config.quotePath),
    quotePath: config.quotePath,
    baseUrl: config.baseUrl,
    bscRpcUrl: config.bscRpcUrl,
    supportedPlatforms: SUPPORTED_PLATFORMS
  });
});

app.get("/api/market", async (req, res) => {
  const platforms = normalizePlatforms(req.query.platform ?? req.query.platforms);
  // Sector/tab only means something within bStocks' own catalog tabs; fetchMarketTokens only
  // applies it to the bStocks slice so Ondo isn't filtered by a taxonomy that doesn't apply to it.
  const tabs = normalizeTabs(req.query.tab ?? req.query.tabs);
  try {
    const liveMarket = await getLiveMarket(platforms, tabs);
    res.json({
      mode: "live",
      cacheStatus: liveMarket.cacheStatus,
      quotes: liveMarket.quotes,
      tokens: tokenRegistry,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    const normalized = normalizeApiError(typedError);
    res.json({
      mode: "fallback",
      cacheStatus: "fallback",
      quotes: getQuotes().filter((quote) => platforms.includes(quote.tokenSource === "Ondo" ? "ondo" : "bstock")),
      tokens: tokenRegistry,
      updatedAt: new Date().toISOString(),
      error: normalized
    });
  }
});

app.get("/api/rwa/tokens", async (req, res) => {
  try {
    const data = await callBinanceGet<Record<string, unknown>>(config.rwaTokensPath, {
      binanceChainId: 56,
      platformId: req.query.platformId ? String(req.query.platformId) : undefined,
      tabId: req.query.tabId ? String(req.query.tabId) : undefined
    });
    res.json({
      ok: true,
      endpoint: config.rwaTokensPath,
      code: data.code,
      msg: data.msg,
      success: data.success,
      timestamp: data.timestamp,
      data: data.data ?? data
    });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({
      ok: false,
      endpoint: config.rwaTokensPath,
      error: typedError.message,
      body: typedError.body
    });
  }
});

app.get("/api/rwa/prices", async (_req, res) => {
  const addresses = tokenRegistry.map((token) => token.address).filter(Boolean).join(",");
  if (!addresses) {
    res.json({ ok: false, mode: "missing_contracts", error: "No token contract addresses configured." });
    return;
  }

  try {
    const data = await callBinanceGet(config.rwaPricePath, {
      binanceChainId: 56,
      tokenContractAddresses: addresses
    });
    res.json({ ok: true, endpoint: config.rwaPricePath, data });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({
      ok: false,
      endpoint: config.rwaPricePath,
      error: typedError.message,
      body: typedError.body
    });
  }
});

app.get("/api/rwa/platforms", async (_req, res) => {
  res.json(await measured("RWA Data API", config.rwaPlatformsPath, "issuance platforms", () => getRwaPlatforms()));
});

app.get("/api/rwa/search", async (req, res) => {
  const keyword = String(req.query.q ?? req.query.keyword ?? "");
  if (!keyword.trim()) {
    res.status(400).json({ ok: false, error: "q is required." });
    return;
  }
  res.json(await measured("RWA Data API", config.rwaSearchPath, keyword, () => searchRwaToken(keyword)));
});

app.get("/api/research/:symbol", async (req, res) => {
  const token = await getTokenBySymbol(String(req.params.symbol ?? ""));
  if (!token) {
    res.status(404).json({ ok: false, error: "Unknown token symbol." });
    return;
  }

  const [candles, profile, market] = await Promise.allSettled([
    measured("Market API", config.marketCandlesPath, token.symbol, () => getMarketCandles(token.address)),
    measured("RWA Data API", config.rwaUnderlyingProfilePath, token.symbol, () => getRwaUnderlyingProfile(token.address)),
    measured("RWA Data API", config.rwaUnderlyingMarketPath, token.symbol, () => getRwaUnderlyingMarket(token.address))
  ]);

  const candleData = candles.status === "fulfilled" ? candles.value : null;
  res.json({
    ok: true,
    token,
    candles: candleData,
    candleSummary: candleData && "data" in candleData ? summarizeCandles(candleData) : null,
    underlyingProfile: profile.status === "fulfilled" ? profile.value : null,
    underlyingMarket: market.status === "fulfilled" ? market.value : null
  });
});

app.get("/api/wallet/:address", async (req, res) => {
  const address = String(req.params.address ?? "");
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ ok: false, error: "Valid EVM address required." });
    return;
  }
  const [balances, portfolio] = await Promise.allSettled([
    measured("Wallet API", config.walletAllBalancesPath, address, () => getWalletBalances(address)),
    measured("Wallet API", config.walletPortfolioOverviewPath, address, () => getPortfolioOverview(address))
  ]);
  res.json({
    ok: true,
    address,
    balances: balances.status === "fulfilled" ? balances.value : { ok: false, error: String(balances.reason) },
    portfolio: portfolio.status === "fulfilled" ? portfolio.value : { ok: false, error: String(portfolio.reason) }
  });
});

app.get("/api/wallet/readiness/:address", async (req, res) => {
  const address = String(req.params.address ?? "");
  const spender = req.query.spender ? String(req.query.spender) : undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ ok: false, error: "Valid EVM address required." });
    return;
  }
  if (spender && !/^0x[a-fA-F0-9]{40}$/.test(spender)) {
    res.status(400).json({ ok: false, error: "Valid spender address required." });
    return;
  }
  try {
    res.json(await walletReadiness(address, spender));
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
});

app.get("/api/tx/status/:hash", async (req, res) => {
  const txHash = String(req.params.hash ?? "");
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    res.status(400).json({ ok: false, error: "Valid transaction hash required." });
    return;
  }
  res.json(await measured("Trading API", config.aggregatorHistoryPath, "transaction status", () => getAggregatorHistory(txHash)));
});

app.get("/api/evidence", (_req, res) => {
  res.json({
    ok: true,
    baseUrl: config.baseUrl,
    modules: [
      "RWA Data API",
      "Market API",
      "Trading API",
      "Transaction API",
      "Wallet API",
      "BSC RPC wallet readiness",
      "Agent endpoint",
      "LLM AI agent",
      "b402 payment hook",
      "Dry-run watcher",
      "Basket engine",
      "Judge readiness"
    ],
    endpoints: {
      rwaTokens: config.rwaTokensPath,
      rwaPlatforms: config.rwaPlatformsPath,
      rwaSearch: config.rwaSearchPath,
      rwaProfile: config.rwaUnderlyingProfilePath,
      marketCandles: config.marketCandlesPath,
      quote: config.quotePath,
      approve: config.approvePath,
      swap: config.swapPath,
      simulate: config.simulatePath,
      gasPrice: config.gasPricePath,
      gasLimit: config.gasLimitPath,
      walletBalances: config.walletAllBalancesPath,
      walletReadiness: "/api/wallet/readiness/:address",
      aiAgent: "/api/ai/agent",
      b402Manifest: "/api/b402/manifest",
      premiumSignal: "/api/premium/signal",
      watcherStatus: "/api/watcher/status",
      watcherTick: "/api/watcher/tick",
      baskets: "/api/baskets/plan",
      judgeReadiness: "/api/judge/readiness",
      judgeSmoke: "/api/judge/smoke"
    },
    recentCalls: apiEvidence
  });
});

app.get("/api/judge/readiness", (_req, res) => {
  res.json(judgeReadiness());
});

app.get("/api/judge/smoke", async (_req, res) => {
  const startedAt = Date.now();
  const checks: Array<{ name: string; ok: boolean; detail?: unknown }> = [];
  checks.push({ name: "health", ok: Boolean(config.apiKey && config.apiSecret), detail: { baseUrl: config.baseUrl } });
  try {
    const market = await getLiveMarket(["bstock"], [9]);
    checks.push({ name: "market", ok: market.quotes.length > 0, detail: { cacheStatus: market.cacheStatus, count: market.quotes.length } });
  } catch (error) {
    checks.push({ name: "market", ok: false, detail: normalizeApiError(error as Error & { status?: number; body?: string }) });
  }
  try {
    const basket = await buildBasketPlan("ai-chips", 25, ["bstock"], "balanced");
    checks.push({ name: "basket", ok: basket.legs.length > 0, detail: { theme: basket.theme, legs: basket.legs.length } });
  } catch (error) {
    checks.push({ name: "basket", ok: false, detail: (error as Error).message });
  }
  const watcher = watcherStatus();
  checks.push({ name: "watcher", ok: watcher.policy.mode === "dry-run", detail: { enabled: watcher.enabled, killed: watcher.killed } });
  // TEMPORARY - surfaces the build/test lifetime budget cap for judges only; this check (and the
  // field behind it) disappears once AUTO_TEST_LIFETIME_USD is unset/removed before delivery.
  if (watcher.policy.testLifetimeCapUsd !== undefined) {
    checks.push({
      name: "test-budget-cap",
      ok: true,
      detail: {
        capUsd: watcher.policy.testLifetimeCapUsd,
        note: "Temporary cumulative cap for the build/test phase only - not a permanent product limit, removed before final delivery."
      }
    });
  }
  try {
    const wallet = await walletReadiness("0x000000000000000000000000000000000000dEaD");
    checks.push({
      name: "wallet-readiness",
      ok: wallet.checks.bscMainnet && wallet.checks.usdcContractCode,
      detail: { chain: wallet.chain, blockNumber: wallet.blockNumber, noBroadcast: wallet.checks.noBroadcast }
    });
  } catch (error) {
    checks.push({ name: "wallet-readiness", ok: false, detail: (error as Error).message });
  }
  checks.push({ name: "b402", ok: true, detail: { manifest: "/api/b402/manifest", premiumSignal: "/api/premium/signal" } });
  checks.push({ name: "broadcast", ok: true, detail: "No backend route broadcasts transactions." });

  res.json({
    ok: checks.every((check) => check.ok),
    latencyMs: Date.now() - startedAt,
    checks,
    readiness: judgeReadiness()
  });
});

app.get("/api/baskets", (_req, res) => {
  res.json({ ok: true, themes: basketThemes });
});

app.post("/api/baskets/plan", async (req, res) => {
  try {
    res.json(await buildBasketPlan(req.body?.theme, req.body?.amountUsd, req.body?.platforms, req.body?.risk));
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({ ok: false, error: normalizeApiError(typedError) });
  }
});

app.get("/api/b402/manifest", (_req, res) => {
  res.json({
    ok: true,
    mode: "demo-payment-manifest",
    protocol: "b402/x402-compatible-shape",
    chain: "BSC mainnet",
    asset: "USDC",
    priceUsd: Number(process.env.B402_DEMO_PRICE_USDC ?? 0.1),
    paidRoute: "/api/premium/signal",
    freeRoutes: ["/api/agent/recommend/compact", "/api/agent/interpret"],
    settlement: "not-settled-in-demo",
    safety: {
      broadcasts_transactions: false,
      requires_user_signature: true,
      note: "This route demonstrates a payment-gated agent interface shape; no production payment is collected."
    }
  });
});

app.post("/api/premium/signal", async (req, res) => {
  const demoPayment = req.header("x-demo-payment");
  if (demoPayment !== "paid") {
    res.status(402).json({
      ok: false,
      paymentRequired: true,
      protocol: "b402/x402-compatible-shape",
      amount: Number(process.env.B402_DEMO_PRICE_USDC ?? 0.1),
      asset: "USDC",
      chain: "BSC mainnet",
      next: "Retry with x-demo-payment: paid for hackathon demo mode.",
      noBroadcast: true
    });
    return;
  }

  const risk = req.body?.risk === "aggressive" ? "aggressive" : "balanced";
  const maxTradeUsd = Number(req.body?.maxTradeUsd ?? 10);
  const platforms = normalizePlatforms(req.body?.platforms);
  const tabs = normalizeTabs(req.body?.tabs);
  const { cacheStatus, tokens } = await fetchRwaTokens(platforms, tabs);
  const opportunities = tokensToOpportunities(tokens).slice(0, 5);
  res.json({
    ok: true,
    mode: "paid-demo-signal",
    cacheStatus,
    risk,
    noBroadcast: true,
    premiumSignal: {
      summary: opportunities[0]
        ? `${opportunities[0].symbol} has the top monitored spread at ${opportunities[0].spreadBps} bps.`
        : "No tokenized-stock spread clears the current monitor.",
      nextAction: "Call /api/execution/prepare before any user signature.",
      maxTradeUsd
    },
    opportunities
  });
});

app.post("/api/ai/agent", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "What should CircuitStock do next?");
  const risk = req.body?.risk === "aggressive" ? "aggressive" : "balanced";
  const maxTradeUsd = Number(req.body?.maxTradeUsd ?? 10);
  const platforms = normalizePlatforms(req.body?.platforms);
  const tabs = normalizeTabs(req.body?.tabs);
  try {
    let { cacheStatus, tokens } = await fetchRwaTokens(platforms, tabs);
    let opportunities = tokensToOpportunities(tokens).slice(0, 8);
    if (opportunities.length === 0 && tabs.length > 0) {
      const expanded = await fetchRwaTokens(platforms, []);
      cacheStatus = expanded.cacheStatus;
      opportunities = tokensToOpportunities(expanded.tokens).slice(0, 8);
    }
    const basket = await buildBasketPlan(req.body?.theme ?? "ai-chips", maxTradeUsd * 2, platforms, risk);
    const result = await runAiAgent({
      prompt,
      opportunities,
      basket: {
        theme: basket.theme,
        label: basket.label,
        summary: basket.summary,
        legs: basket.legs.slice(0, 5)
      },
      watcher: watcherStatus(),
      readiness: judgeReadiness()
    });
    res.json({
      ...result,
      cacheStatus,
      context: {
        opportunities,
        basket: {
          theme: basket.theme,
          summary: basket.summary,
          legs: basket.legs.slice(0, 5)
        }
      }
    });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({ ok: false, error: normalizeApiError(typedError) });
  }
});

app.post("/api/agent/interpret", async (req, res) => {
  const prompt = String(req.body?.prompt ?? "");
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  if (!prompt.trim()) {
    res.status(400).json({ ok: false, error: "prompt is required." });
    return;
  }

  const intent = parsePlainLanguageIntent(prompt);
  const token = await getTokenBySymbol(intent.symbol);
  const search = await measured("RWA Data API", config.rwaSearchPath, intent.symbol, () => searchRwaToken(intent.symbol));
  const research = token
    ? {
        token,
        profile: await measured("RWA Data API", config.rwaUnderlyingProfilePath, token.symbol, () =>
          getRwaUnderlyingProfile(token.address)
        ),
        market: await measured("RWA Data API", config.rwaUnderlyingMarketPath, token.symbol, () =>
          getRwaUnderlyingMarket(token.address)
        )
      }
    : null;
  const execution = intent.researchOnly ? null : await prepareExecution(intent.symbol, intent.side, intent.amountUsd, walletAddress);

  res.json({
    ok: true,
    mode: "plain-language-agent",
    intent,
    search,
    research,
    execution,
    spokenSummary: intent.researchOnly
      ? `${intent.symbol} resolved for research. Review trading status and underlying profile before any trade.`
      : `${intent.side.toUpperCase()} ${intent.symbol} preview prepared for $${intent.amountUsd}. No broadcast performed; user signature is required.`
  });
});

app.post("/api/quote", async (req, res) => {
  const symbol = String(req.body?.symbol ?? "");
  const side = req.body?.side === "sell" ? "sell" : "buy";
  const amountUsd = Number(req.body?.amountUsd ?? 100);
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  const token = await getTokenBySymbol(symbol);

  if (!token) {
    res.status(404).json({ ok: false, error: `Unknown token symbol: ${symbol}` });
    return;
  }

  if (!quoteTokens.usdc.address) {
    res.json({
      ok: false,
      mode: "missing_contracts",
      error: "Add token contract addresses and BSC_USDC_ADDRESS in .env before requesting live quotes.",
      token,
      quoteToken: quoteTokens.usdc
    });
    return;
  }

  const slippageBps = resolveSlippageBps(req.body?.slippageBps);
  const amount = BigInt(Math.round(amountUsd * 10 ** quoteTokens.usdc.decimals)).toString();
  const quote = await getBinanceQuote({
    fromTokenAddress: side === "buy" ? quoteTokens.usdc.address : token.address,
    toTokenAddress: side === "buy" ? token.address : quoteTokens.usdc.address,
    amount,
    walletAddress,
    slippageBps
  });

  res.json({ ...quote, request: { symbol, side, amountUsd, walletAddress, slippageBps } });
});

app.post("/api/swap", async (req, res) => {
  const symbol = String(req.body?.symbol ?? "");
  const side = req.body?.side === "sell" ? "sell" : "buy";
  const amountUsd = Number(req.body?.amountUsd ?? 10);
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  const quoteId = req.body?.quoteId ? String(req.body.quoteId) : undefined;
  const token = await getTokenBySymbol(symbol);

  if (!token || !quoteTokens.usdc.address || !walletAddress || !quoteId) {
    res.status(400).json({ ok: false, error: "symbol, walletAddress and quoteId are required for swap building." });
    return;
  }

  const slippageBps = resolveSlippageBps(req.body?.slippageBps);
  const amount = BigInt(Math.round(amountUsd * 10 ** quoteTokens.usdc.decimals)).toString();
  const swap = await getBinanceSwap({
    fromTokenAddress: side === "buy" ? quoteTokens.usdc.address : token.address,
    toTokenAddress: side === "buy" ? token.address : quoteTokens.usdc.address,
    amount,
    walletAddress,
    quoteId,
    slippageBps
  });
  const evmTx = swap.ok ? pickEvmTx(swap.data) : null;
  res.json({ ...swap, evmTx: evmTx ? { ...evmTx, from: evmTx.from ?? walletAddress } : null });
});

app.post("/api/simulate", async (req, res) => {
  const evmTx = req.body?.evmTx;
  if (!evmTx?.from || !evmTx?.to) {
    res.status(400).json({ ok: false, error: "evmTx.from and evmTx.to are required." });
    return;
  }
  res.json(await simulateEvmTransaction(evmTx));
});

app.post("/api/execution/prepare", async (req, res) => {
  const symbol = String(req.body?.symbol ?? "");
  const side = req.body?.side === "sell" ? "sell" : "buy";
  const amountUsd = Number(req.body?.amountUsd ?? 10);
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  res.json(await prepareExecution(symbol, side, amountUsd, walletAddress, resolveSlippageBps(req.body?.slippageBps)));
});

app.post("/api/agent/recommend", async (req, res) => {
  const risk = req.body?.risk === "aggressive" ? "aggressive" : "balanced";
  const maxTradeUsd = Number(req.body?.maxTradeUsd ?? 10);
  const platforms = normalizePlatforms(req.body?.platforms);
  const tabs = normalizeTabs(req.body?.tabs);
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  const minScore = risk === "aggressive" ? 20 : 35;

  try {
    let { tokens } = await fetchRwaTokens(platforms, tabs);
    let opportunities = tokensToOpportunities(tokens);
    if (opportunities.length === 0 && tabs.length > 0) {
      const expanded = await fetchRwaTokens(platforms, []);
      tokens = expanded.tokens;
      opportunities = tokensToOpportunities(tokens);
    }
    const actionable = opportunities.filter((opportunity) => opportunity.score >= minScore && opportunity.direction !== "watch");
    const top = actionable[0] ?? opportunities[0];
    const action = top ? actionFromOpportunity(top, maxTradeUsd) : null;
    const execution = action
      ? await prepareExecution(action.symbol, action.action === "trim" ? "sell" : "buy", action.simulatedUsd, walletAddress)
      : null;

    res.json({
      mode: "live-agent",
      risk,
      platforms,
      tabs,
      rules: {
        maxTradeUsd,
        minScore,
        requiresSimulation: true,
        requiresUserSignature: true,
        broadcasted: false
      },
      opportunities: opportunities.slice(0, 12),
      action,
      execution,
      skillHints: ["scan_tokenized_stock_spreads", "prepare_rebalance"]
    });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({ ok: false, error: typedError.body ?? typedError.message });
  }
});

app.post("/api/agent/recommend/compact", async (req, res) => {
  const risk = req.body?.risk === "aggressive" ? "aggressive" : "balanced";
  const maxTradeUsd = Number(req.body?.maxTradeUsd ?? 10);
  const platforms = normalizePlatforms(req.body?.platforms);
  const tabs = normalizeTabs(req.body?.tabs);
  const walletAddress = req.body?.walletAddress ? String(req.body.walletAddress) : undefined;
  const minScore = risk === "aggressive" ? 20 : 35;

  try {
    let { cacheStatus, tokens } = await fetchRwaTokens(platforms, tabs);
    let opportunities = tokensToOpportunities(tokens);
    if (opportunities.length === 0 && tabs.length > 0) {
      const expanded = await fetchRwaTokens(platforms, []);
      cacheStatus = expanded.cacheStatus;
      tokens = expanded.tokens;
      opportunities = tokensToOpportunities(tokens);
    }
    const top = opportunities.find((opportunity) => opportunity.score >= minScore && opportunity.direction !== "watch") ?? opportunities[0];
    const action = top ? actionFromOpportunity(top, maxTradeUsd) : null;
    const execution = action
      ? await prepareExecution(action.symbol, action.action === "trim" ? "sell" : "buy", action.simulatedUsd, walletAddress)
      : null;

    res.json({
      recommendation: action
        ? {
            symbol: action.symbol,
            action: action.action,
            amountUsd: action.simulatedUsd,
            confidence: Math.min(99, Math.max(1, action.score)),
            reason: action.reason
          }
        : null,
      required_user_action: execution?.nextRequiredAction ?? "No actionable spread found.",
      transaction_preview: execution
        ? {
            quoteId: (execution.selectedQuote as { quoteId?: string } | null)?.quoteId,
            approvalReady: Boolean(execution.approvalTx),
            swapReady: Boolean(execution.swapTx),
            simulationStatus: execution.simulationSummary?.status,
            humanStatus: execution.humanStatus,
            walletChecked: Boolean(execution.walletSnapshot?.balances),
            gasEstimated: Boolean(execution.gasPrice || execution.gasLimit),
            researchLoaded: Boolean(execution.research?.candles || execution.research?.underlyingProfile),
            broadcasted: false
          }
        : null,
      cacheStatus,
      skills: ["scan_tokenized_stock_spreads", "prepare_rebalance"]
    });
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    res.status(typedError.status ?? 500).json({ ok: false, error: normalizeApiError(typedError) });
  }
});

app.post("/api/strategy", async (req, res) => {
  const risk = req.body?.risk === "aggressive" ? "aggressive" : "balanced";
  const maxTradeUsd = Number(req.body?.maxTradeUsd ?? 10);
  const platforms = normalizePlatforms(req.body?.platforms);
  const tabs = normalizeTabs(req.body?.tabs);
  const minScore = risk === "aggressive" ? 20 : 35;

  try {
    let { tokens } = await fetchRwaTokens(platforms, tabs);
    let opportunities = tokensToOpportunities(tokens);
    if (opportunities.length === 0 && tabs.length > 0) {
      const expanded = await fetchRwaTokens(platforms, []);
      tokens = expanded.tokens;
      opportunities = tokensToOpportunities(tokens);
    }
    const actions = opportunities
      .filter((opportunity) => opportunity.score >= minScore)
      .slice(0, 4)
      .map((opportunity) => ({
        ...actionFromOpportunity(opportunity, maxTradeUsd),
        nextStep: "Quote, build swap calldata, simulate, then request user signature."
      }));

    res.json({
      mode: "live",
      risk,
      actions,
      rules: {
        maxTradeUsd,
        minScore,
        requiresSimulation: true,
        requiresUserSignature: true,
        broadcasted: false
      }
    });
  } catch (error) {
    const fallback = getQuotes().map((quote) => ({
      symbol: quote.symbol,
      action: quote.spreadBps > 0 ? "trim" : "buy",
      reason: "Fallback strategy from local seed data.",
      simulatedUsd: Math.min(maxTradeUsd, Math.round(quote.liquidityUsd * 0.0008)),
      score: Math.abs(quote.spreadBps),
      tokenAddress: "",
      nextStep: "Retry live Binance Web3 API."
    }));
    res.json({ mode: "fallback", risk, actions: fallback, error: (error as Error).message });
  }
});

const watcherDeps: WatcherDeps = {
  fetchOpportunities: async () => {
    // Fail closed: Binance's own referencePrice is derived from the on-chain price (confirmed
    // empirically, see docs/dx-report-notes.md), so it is not a real signal - the watcher must
    // never auto-trade off it. No independent reference configured/populated -> no candidates.
    const providers = referencePriceProvidersConfigured();
    if (!(providers.alpaca || providers.finnhub) || universeBySymbol.size === 0) return [];
    const { tokens } = await fetchRwaTokens(SUPPORTED_PLATFORMS, []);
    return applyIndependentReference(tokensToOpportunities(tokens));
  },
  prepare: (symbol, side, amountUsd, walletAddress, slippageBps) =>
    prepareExecution(symbol, side, amountUsd, walletAddress, resolveSlippageBps(slippageBps))
};

app.get("/api/watcher/status", (_req, res) => {
  res.json(watcherStatus());
});

app.post("/api/watcher/kill", (_req, res) => {
  setKilled(true);
  res.json(watcherStatus());
});

app.post("/api/watcher/resume", (_req, res) => {
  setKilled(false);
  res.json(watcherStatus());
});

app.post("/api/watcher/tick", async (_req, res) => {
  res.json({ decision: await tick(watcherDeps), status: watcherStatus() });
});

// User-editable trading/arbitrage settings (min spread, min score, min liquidity, max trade,
// max daily budget, slippage, cooldown, whitelist). Everything else about the watcher
// (enabled, mode, wallet, the temporary test budget cap) stays operator/env-only.
app.get("/api/watcher/policy", (_req, res) => {
  const { minSpreadBps, minScore, minLiquidityUsd, maxTradeUsd, maxDailyUsd, maxSlippageBps, cooldownSec, allowedSymbols } = getPolicy();
  res.json({ ok: true, policy: { minSpreadBps, minScore, minLiquidityUsd, maxTradeUsd, maxDailyUsd, maxSlippageBps, cooldownSec, allowedSymbols } });
});

app.post("/api/watcher/policy", (req, res) => {
  const body = req.body ?? {};
  const allowedSymbols = Array.isArray(body.allowedSymbols)
    ? body.allowedSymbols
    : typeof body.allowedSymbols === "string"
      ? body.allowedSymbols.split(",")
      : undefined;
  const updated = updatePolicy({
    minSpreadBps: body.minSpreadBps,
    minScore: body.minScore,
    minLiquidityUsd: body.minLiquidityUsd,
    maxTradeUsd: body.maxTradeUsd,
    maxDailyUsd: body.maxDailyUsd,
    maxSlippageBps: body.maxSlippageBps,
    cooldownSec: body.cooldownSec,
    allowedSymbols
  });
  const { minSpreadBps, minScore, minLiquidityUsd, maxTradeUsd, maxDailyUsd, maxSlippageBps, cooldownSec, allowedSymbols: symbols } = updated;
  res.json({ ok: true, policy: { minSpreadBps, minScore, minLiquidityUsd, maxTradeUsd, maxDailyUsd, maxSlippageBps, cooldownSec, allowedSymbols: symbols } });
});

app.listen(port, () => {
  console.log(`CircuitStock API listening on http://localhost:${port}`);
  startWatcher(watcherDeps);
  if (universeBySymbol.size > 0) {
    startAlpacaStream([...universeBySymbol.values()].map((entry) => entry.underlyingTicker));
  }
});
