import crypto from "node:crypto";
import { config } from "./env";

type QuoteRequest = {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  walletAddress?: string;
  slippageBps?: number;
};

type SwapRequest = QuoteRequest & {
  quoteId: string;
};

type ApproveRequest = {
  tokenAddress: string;
  amount: string;
  walletAddress: string;
  vendor?: string;
};

type EvmTx = {
  from: string;
  to: string;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
};

export type BinanceQuoteResult =
  | {
      ok: true;
      mode: "live";
      endpoint: string;
      data: unknown;
    }
  | {
      ok: false;
      mode: "not_configured" | "failed";
      endpoint?: string;
      error: string;
      status?: number;
      body?: string;
    };

export type BinanceCallResult =
  | {
      ok: true;
      mode: "live";
      endpoint: string;
      data: unknown;
    }
  | {
      ok: false;
      mode: "failed";
      endpoint: string;
      error: string;
      status?: number;
      body?: string;
    };

function signPayload(payload: string): string {
  if (!config.apiSecret) return "";
  return crypto.createHmac("sha256", config.apiSecret).update(payload, "utf8").digest("base64");
}

/**
 * Binance Wallet/Transaction APIs return HTTP 200 even on a business error - only `body.code`
 * tells you (documented, and confirmed: nothing in this client checked it before this fix).
 * Parses the body and throws (with `.status`/`.body` attached, same shape as the HTTP-error path)
 * whenever `code` is present and non-zero.
 */
function parseEnvelope<T>(text: string, httpStatus: number): T {
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return text as T;
  }
  const envelope = parsed as { code?: number; msg?: string; success?: boolean } | null;
  if (envelope && typeof envelope === "object" && "code" in envelope && envelope.code !== 0) {
    const error = new Error(envelope.msg || `Binance Web3 business error (code ${envelope.code})`);
    Object.assign(error, { status: httpStatus, body: text });
    throw error;
  }
  return parsed as T;
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): URL {
  const base = config.baseUrl.replace(/\/$/, "");
  const url = new URL(path.startsWith("/") ? `${base}${path}` : `${base}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

export async function callBinanceGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("Missing Binance Web3 API credentials.");
  }

  const timestamp = new Date().toISOString();
  const url = buildUrl(path, params);
  const requestPath = `${url.pathname}${url.search}`;
  const signature = signPayload(`${timestamp}GET${requestPath}`);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-OC-APIKEY": config.apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
      "X-OC-RECV-WINDOW": "60000",
      Accept: "application/json"
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || `Binance Web3 request failed with ${response.status}`);
    Object.assign(error, { status: response.status, body: text });
    throw error;
  }

  return parseEnvelope<T>(text, response.status);
}

export async function callBinancePost<T>(path: string, body: unknown): Promise<T> {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("Missing Binance Web3 API credentials.");
  }

  const timestamp = new Date().toISOString();
  const url = buildUrl(path, {});
  const bodyText = JSON.stringify(body);
  const signature = signPayload(`${timestamp}POST${url.pathname}${bodyText}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OC-APIKEY": config.apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
      "X-OC-RECV-WINDOW": "60000",
      Accept: "application/json"
    },
    body: bodyText
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(text || `Binance Web3 request failed with ${response.status}`);
    Object.assign(error, { status: response.status, body: text });
    throw error;
  }

  return parseEnvelope<T>(text, response.status);
}

function toResult(endpoint: string, fn: () => Promise<unknown>): Promise<BinanceCallResult> {
  return fn()
    .then((data) => ({ ok: true as const, mode: "live" as const, endpoint, data }))
    .catch((error: Error & { status?: number; body?: string }) => ({
      ok: false as const,
      mode: "failed" as const,
      endpoint,
      error: error.message,
      status: error.status,
      body: error.body
    }));
}

export async function getBinanceQuote(request: QuoteRequest): Promise<BinanceQuoteResult> {
  try {
    const data = await callBinanceGet(config.quotePath, {
      binanceChainId: 56,
      fromTokenAddress: request.fromTokenAddress,
      toTokenAddress: request.toTokenAddress,
      amount: request.amount,
      userWalletAddress: request.walletAddress,
      slippagePercent: request.slippageBps ? request.slippageBps / 100 : undefined
    });
    return { ok: true, mode: "live", endpoint: config.quotePath, data };
  } catch (error) {
    const typedError = error as Error & { status?: number; body?: string };
    return {
      ok: false,
      mode: "failed",
      endpoint: config.quotePath,
      error: typedError.message,
      status: typedError.status,
      body: typedError.body
    };
  }
}

export type RoundTripCostResult =
  | { ok: true; costPct: number; buyVendor?: string; sellVendor?: string; receivedTokenAmount: string; usdtOut: number }
  | { ok: false; reason: string };

/**
 * Measures the REAL executable round-trip cost of a route: quote buying `tokenAddress` with
 * `quoteAmount` of `quoteTokenAddress`, then quote selling back EXACTLY the amount received - no
 * price snapshot, no division, no reference price anywhere in the calculation. This is
 * deliberately NOT based on `priceImpactPercent`: that field was found to dramatically understate
 * real cost for at least one route (SPYon via Pancakeswap V3 - see docs/cross-issuer-spreads.md,
 * reported impact ~0.1% against a measured round-trip cost that ranged from 11% to 53% across
 * separate sessions days apart). Only the quote's own output/input amounts are trusted.
 */
export async function measureRoundTripCost(
  tokenAddress: string,
  quoteTokenAddress: string,
  quoteAmount: string,
  walletAddress?: string
): Promise<RoundTripCostResult> {
  const buy = await getBinanceQuote({ fromTokenAddress: quoteTokenAddress, toTokenAddress: tokenAddress, amount: quoteAmount, walletAddress });
  const buyRoute = buy.ok ? (buy.data as { data?: Array<Record<string, unknown>> })?.data?.[0] : null;
  if (!buyRoute?.toTokenAmount) {
    return { ok: false, reason: buy.ok ? "no buy route" : buy.error ?? "buy quote failed" };
  }

  const sell = await getBinanceQuote({
    fromTokenAddress: tokenAddress,
    toTokenAddress: quoteTokenAddress,
    amount: String(buyRoute.toTokenAmount),
    walletAddress
  });
  const sellRoute = sell.ok ? (sell.data as { data?: Array<Record<string, unknown>> })?.data?.[0] : null;
  if (!sellRoute?.toTokenAmount) {
    return { ok: false, reason: sell.ok ? "no sell route" : sell.error ?? "sell quote failed" };
  }

  const amountInNum = Number(quoteAmount);
  const amountOutNum = Number(sellRoute.toTokenAmount);
  if (!Number.isFinite(amountInNum) || amountInNum <= 0 || !Number.isFinite(amountOutNum)) {
    return { ok: false, reason: "non-finite amounts returned by quote" };
  }
  const costPct = ((amountInNum - amountOutNum) / amountInNum) * 100;

  return {
    ok: true,
    costPct,
    buyVendor: typeof buyRoute.vendorName === "string" ? buyRoute.vendorName : undefined,
    sellVendor: typeof sellRoute.vendorName === "string" ? sellRoute.vendorName : undefined,
    receivedTokenAmount: String(buyRoute.toTokenAmount),
    usdtOut: amountOutNum / 1e18
  };
}

export async function getBinanceSwap(request: SwapRequest): Promise<BinanceCallResult> {
  return toResult(config.swapPath, () =>
    callBinanceGet(config.swapPath, {
      binanceChainId: 56,
      fromTokenAddress: request.fromTokenAddress,
      toTokenAddress: request.toTokenAddress,
      amount: request.amount,
      userWalletAddress: request.walletAddress,
      quoteId: request.quoteId,
      slippagePercent: request.slippageBps ? request.slippageBps / 100 : undefined,
      approveTransaction: "true",
      autoSlippage: "false",
      gasLevel: "average",
      priceImpactProtectionPercent: "5"
    })
  );
}

export async function getBinanceApproveTransaction(request: ApproveRequest): Promise<BinanceCallResult> {
  return toResult(config.approvePath, () =>
    callBinanceGet(config.approvePath, {
      binanceChainId: 56,
      tokenContractAddress: request.tokenAddress,
      tokenAddress: request.tokenAddress,
      approveAmount: request.amount,
      amount: request.amount,
      userWalletAddress: request.walletAddress,
      vendor: request.vendor
    })
  );
}

export async function getGasPrice(): Promise<BinanceCallResult> {
  return toResult(config.gasPricePath, () => callBinanceGet(config.gasPricePath, { binanceChainId: 56 }));
}

export async function getGasLimit(evmTx: EvmTx): Promise<BinanceCallResult> {
  return toResult(config.gasLimitPath, () =>
    callBinancePost(config.gasLimitPath, {
      binanceChainId: "56",
      evmTx: {
        from: evmTx.from,
        to: evmTx.to,
        value: evmTx.value ?? "0",
        data: evmTx.data ?? "0x"
      }
    })
  );
}

export async function getWalletBalances(walletAddress: string): Promise<BinanceCallResult> {
  return toResult(config.walletAllBalancesPath, () =>
    callBinanceGet(config.walletAllBalancesPath, {
      binanceChainId: 56,
      address: walletAddress,
      walletAddress
    })
  );
}

export async function getPortfolioOverview(walletAddress: string): Promise<BinanceCallResult> {
  return toResult(config.walletPortfolioOverviewPath, () =>
    callBinanceGet(config.walletPortfolioOverviewPath, {
      binanceChainId: 56,
      address: walletAddress,
      walletAddress
    })
  );
}

export async function getMarketCandles(tokenAddress: string, bar = "1h", limit = 24): Promise<BinanceCallResult> {
  // Param is `bar`, not `interval` - the doc's own param name (binance-web3-context.md §4.1).
  // `interval` is silently dropped by the API, which then defaults to bar=1m: this was quietly
  // returning the last 24 one-minute candles (often spanning far less than an hour of real trades
  // for a thin RWA token) instead of 24 hours, ever since this function was written. Confirmed
  // empirically: before this fix, 24 points for IBMB spanned ~5h of sparse 1-minute buckets, with
  // ~1min gaps between populated candles - not a 24h window by any reading.
  return toResult(config.marketCandlesPath, () =>
    callBinanceGet(config.marketCandlesPath, {
      binanceChainId: 56,
      tokenContractAddress: tokenAddress,
      bar,
      limit
    })
  );
}

export async function getRwaPlatforms(): Promise<BinanceCallResult> {
  return toResult(config.rwaPlatformsPath, () =>
    callBinanceGet(config.rwaPlatformsPath, {
      binanceChainId: 56
    })
  );
}

export async function searchRwaToken(keyword: string): Promise<BinanceCallResult> {
  return toResult(config.rwaSearchPath, () =>
    callBinanceGet(config.rwaSearchPath, {
      binanceChainId: 56,
      keyword,
      query: keyword
    })
  );
}

export async function getRwaUnderlyingProfile(tokenContractAddress: string): Promise<BinanceCallResult> {
  return toResult(config.rwaUnderlyingProfilePath, () =>
    callBinanceGet(config.rwaUnderlyingProfilePath, {
      binanceChainId: 56,
      tokenContractAddress
    })
  );
}

export async function getRwaUnderlyingMarket(tokenContractAddress: string): Promise<BinanceCallResult> {
  return toResult(config.rwaUnderlyingMarketPath, () =>
    callBinanceGet(config.rwaUnderlyingMarketPath, {
      binanceChainId: 56,
      tokenContractAddress
    })
  );
}

export async function getAggregatorHistory(txHash: string): Promise<BinanceCallResult> {
  return toResult(config.aggregatorHistoryPath, () =>
    callBinanceGet(config.aggregatorHistoryPath, {
      binanceChainId: 56,
      txHash
    })
  );
}

export async function simulateEvmTransaction(evmTx: EvmTx): Promise<BinanceCallResult> {
  return toResult(config.simulatePath, () =>
    callBinancePost(config.simulatePath, {
      binanceChainId: "56",
      evmTx: {
        from: evmTx.from,
        to: evmTx.to,
        value: evmTx.value ?? "0",
        data: evmTx.data ?? "0x"
      }
    })
  );
}
