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
import { config } from "./env";
import { getToken, quoteTokens, tokenRegistry } from "./tokenRegistry";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const rwaCache = new Map<string, { expiresAt: number; tokens: RwaToken[] }>();
const apiEvidence: ApiEvidence[] = [];

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

type MarketQuote = {
  symbol: string;
  name: string;
  tokenSource: "bStocks" | "xStocks" | "Ondo";
  onchainPrice: number;
  referencePrice: number;
  spreadBps: number;
  liquidityUsd: number;
  marketWindow: "open" | "closed" | "pre-market" | "after-hours";
  contractReady: boolean;
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

type CacheStatus = "live" | "cached";

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

const seedQuotes: Omit<MarketQuote, "spreadBps" | "contractReady">[] = [
  {
    symbol: "AAPLx",
    name: "Apple tokenized stock",
    tokenSource: "xStocks",
    onchainPrice: 239.42,
    referencePrice: 238.88,
    liquidityUsd: 812000,
    marketWindow: "after-hours"
  },
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
    return { ...quote, onchainPrice, spreadBps, contractReady: Boolean(token?.address && quoteTokens.usdc.address) };
  });
}

function toMarketWindow(token: RwaToken): MarketQuote["marketWindow"] {
  if (token.statusInfo?.openState) return "open";
  if (token.statusInfo?.reasonCode === "PRE_MARKET") return "pre-market";
  if (token.statusInfo?.reasonCode === "AFTER_HOURS") return "after-hours";
  return "closed";
}

async function getLiveMarket(): Promise<{ cacheStatus: CacheStatus; quotes: MarketQuote[] }> {
  const { cacheStatus, tokens } = await fetchRwaTokens(["bstock"], [9]);

  return { cacheStatus, quotes: tokensToOpportunities(tokens).slice(0, 8) };
}

async function fetchRwaTokens(platforms = ["bstock"], tabs = [9]): Promise<RwaTokenResult> {
  const cacheKey = `${platforms.sort().join(",")}:${tabs.sort().join(",")}`;
  const cached = rwaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { cacheStatus: "cached", tokens: cached.tokens };

  const tabFilters = tabs.length > 0 ? tabs : [undefined];
  const calls = platforms.flatMap((platformId) =>
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
  const responses = await Promise.all(calls);
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

function tokensToOpportunities(tokens: RwaToken[]): Opportunity[] {
  return tokens
    .filter((token) => Number(token.tokenPrice) > 0 && Number(token.referencePrice) > 0)
    .map((token) => {
      const onchainPrice = Number(token.tokenPrice);
      const referencePrice = Number(token.referencePrice);
      const spreadBps = Math.round(((onchainPrice - referencePrice) / referencePrice) * 10000);
      const liquidityUsd = Number(token.volume24H ?? 0);
      const absSpread = Math.abs(spreadBps);
      const liquidityScore = Math.min(40, Math.log10(Math.max(liquidityUsd, 1)) * 5);
      const statusScore = token.statusInfo?.openState ? 10 : 20;
      const score = Math.round(absSpread * 1.2 + liquidityScore + statusScore);
      const direction = (absSpread < 5 ? "watch" : spreadBps < 0 ? "buy" : "trim") as Opportunity["direction"];
      return {
        symbol: token.tokenSymbol,
        name: token.underlyingName || token.tokenName,
        tokenSource: (token.platformId === "ondo" ? "Ondo" : "bStocks") as MarketQuote["tokenSource"],
        onchainPrice,
        referencePrice,
        spreadBps,
        liquidityUsd,
        marketWindow: toMarketWindow(token),
        contractReady: Boolean(token.tokenContractAddress && quoteTokens.usdc.address),
        tokenAddress: token.tokenContractAddress,
        decimals: Number(token.decimals || 18),
        score,
        direction,
        reason:
          direction === "buy"
            ? "Token trades below reference price with sufficient 24h liquidity."
            : direction === "trim"
              ? "Token trades above reference price; trim or route into a cheaper exposure."
              : "Spread is tight; keep monitoring until drift clears the threshold."
      };
    })
    .sort((a, b) => b.score - a.score);
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
  const { tokens } = await fetchRwaTokens(["bstock", "ondo"], [9, 4, 11]);
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

function normalizePlatforms(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0) return ["bstock"];
  return input.map(String).filter((platform) => ["bstock", "ondo"].includes(platform));
}

function normalizeTabs(input: unknown): number[] {
  if (!Array.isArray(input) || input.length === 0) return [9, 4, 11];
  return input.map(Number).filter((tab) => Number.isInteger(tab) && tab > 0);
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

function compactError(result: unknown) {
  const payload = result as { ok?: boolean; error?: string; body?: string; status?: number };
  if (payload.ok !== false) return null;
  return normalizeApiError({ message: payload.error ?? "API call failed", body: payload.body, status: payload.status } as Error & {
    status?: number;
    body?: string;
  });
}

function findNumbersDeep(value: unknown, keys = ["close", "c", "price"]): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => findNumbersDeep(item, keys));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = keys
      .map((key) => record[key])
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0);
    return direct.length ? direct : Object.values(record).flatMap((item) => findNumbersDeep(item, keys));
  }
  return [];
}

function summarizeCandles(candles: unknown) {
  const prices = findNumbersDeep(candles).slice(-24);
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

async function prepareExecution(symbol: string, side: "buy" | "sell", amountUsd: number, walletAddress?: string) {
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
  const quote = await getBinanceQuote({ fromTokenAddress, toTokenAddress, amount, walletAddress, slippageBps: 50 });
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
    token.underlyingTicker
      ? measured("RWA Data API", config.rwaUnderlyingProfilePath, token.underlyingTicker, () =>
          getRwaUnderlyingProfile(token.underlyingTicker!)
        )
      : Promise.resolve(null),
    token.underlyingTicker
      ? measured("RWA Data API", config.rwaUnderlyingMarketPath, token.underlyingTicker, () =>
          getRwaUnderlyingMarket(token.underlyingTicker!)
        )
      : Promise.resolve(null)
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
    swap = await getBinanceSwap({ fromTokenAddress, toTokenAddress, amount, walletAddress, slippageBps: 50, quoteId });
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
      candleSummary: candles && "data" in candles ? summarizeCandles((candles as { data?: unknown }).data) : null,
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
    bscRpcUrl: config.bscRpcUrl
  });
});

app.get("/api/market", async (_req, res) => {
  try {
    const liveMarket = await getLiveMarket();
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
      quotes: getQuotes(),
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
    token.underlyingTicker
      ? measured("RWA Data API", config.rwaUnderlyingProfilePath, token.underlyingTicker, () =>
          getRwaUnderlyingProfile(token.underlyingTicker!)
        )
      : Promise.resolve(null),
    token.underlyingTicker
      ? measured("RWA Data API", config.rwaUnderlyingMarketPath, token.underlyingTicker, () =>
          getRwaUnderlyingMarket(token.underlyingTicker!)
        )
      : Promise.resolve(null)
  ]);

  const candleData = candles.status === "fulfilled" ? candles.value : null;
  res.json({
    ok: true,
    token,
    candles: candleData,
    candleSummary: candleData && "data" in candleData ? summarizeCandles((candleData as { data?: unknown }).data) : null,
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
      "Agent endpoint"
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
      walletBalances: config.walletAllBalancesPath
    },
    recentCalls: apiEvidence
  });
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
        profile: token.underlyingTicker
          ? await measured("RWA Data API", config.rwaUnderlyingProfilePath, token.underlyingTicker, () =>
              getRwaUnderlyingProfile(token.underlyingTicker!)
            )
          : null,
        market: token.underlyingTicker
          ? await measured("RWA Data API", config.rwaUnderlyingMarketPath, token.underlyingTicker, () =>
              getRwaUnderlyingMarket(token.underlyingTicker!)
            )
          : null
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

  const amount = BigInt(Math.round(amountUsd * 10 ** quoteTokens.usdc.decimals)).toString();
  const quote = await getBinanceQuote({
    fromTokenAddress: side === "buy" ? quoteTokens.usdc.address : token.address,
    toTokenAddress: side === "buy" ? token.address : quoteTokens.usdc.address,
    amount,
    walletAddress,
    slippageBps: 50
  });

  res.json({ ...quote, request: { symbol, side, amountUsd, walletAddress } });
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

  const amount = BigInt(Math.round(amountUsd * 10 ** quoteTokens.usdc.decimals)).toString();
  const swap = await getBinanceSwap({
    fromTokenAddress: side === "buy" ? quoteTokens.usdc.address : token.address,
    toTokenAddress: side === "buy" ? token.address : quoteTokens.usdc.address,
    amount,
    walletAddress,
    quoteId,
    slippageBps: 50
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
  res.json(await prepareExecution(symbol, side, amountUsd, walletAddress));
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

app.listen(port, () => {
  console.log(`CircuitStock API listening on http://localhost:${port}`);
});
