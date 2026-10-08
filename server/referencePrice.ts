// Independent reference price layer: Alpaca (primary, WS live + REST snapshot realignment) with
// Finnhub as fallback when Alpaca is missing/stale. This is what makes the on-chain/reference
// spread a real signal - see docs/arbitrage-and-data-fetching.md §A1 and the empirical proof in
// docs/dx-report-notes.md (Binance's own referencePrice is derived from tokenPrice, not independent).
import { config } from "./env";
import { isStale } from "./spread";

export type ReferenceSource = "alpaca" | "finnhub";

export type ReferenceReading = {
  price: number;
  ts: number; // epoch ms
  source: ReferenceSource;
};

export type ReferencePrice = ReferenceReading & {
  marketOpen: boolean;
  stale: boolean;
  crossCheckWarning?: string;
};

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for unit tests - no network in this section).
// ---------------------------------------------------------------------------------------------

/** Picks the freshest usable reading among candidates; null if none are usable. */
export function selectReading(candidates: Array<ReferenceReading | null | undefined>): ReferenceReading | null {
  const valid = candidates.filter(
    (candidate): candidate is ReferenceReading => Boolean(candidate) && Number.isFinite(candidate!.price) && candidate!.price > 0
  );
  if (valid.length === 0) return null;
  return valid.reduce((best, item) => (item.ts > best.ts ? item : best));
}

/** Flags when two independent readings disagree beyond a sanity bound - usually a feed problem. */
export function crossCheck(a: ReferenceReading | null, b: ReferenceReading | null, boundPct = 2): string | undefined {
  if (!a || !b || a.source === b.source) return undefined;
  const diffPct = Math.abs((a.price - b.price) / b.price) * 100;
  if (diffPct <= boundPct) return undefined;
  return `${a.source} ($${a.price.toFixed(4)}) vs ${b.source} ($${b.price.toFixed(4)}) disagree by ${diffPct.toFixed(2)}%`;
}

/** Exponential backoff with jitter, capped. attempt is 1-based (first retry = attempt 1). */
export function computeBackoffMs(attempt: number, baseMs = 500, capMs = 15000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

// ---------------------------------------------------------------------------------------------
// I/O: caches, HTTP clients, WS live feed.
// ---------------------------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HttpResult = { ok: boolean; status: number; data: unknown };

async function fetchJson(url: string, headers: Record<string, string>): Promise<HttpResult> {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}

/** GET with exponential backoff on 429 only (other errors fail immediately - no point retrying a 401/404). */
async function fetchWithBackoff(url: string, headers: Record<string, string>, maxAttempts = 3): Promise<HttpResult | null> {
  let result: HttpResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      result = await fetchJson(url, headers);
    } catch (error) {
      console.warn("[referencePrice] fetch failed", url, (error as Error).message);
      return null;
    }
    if (result.ok) return result;
    if (result.status === 429 && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }
    return result;
  }
  return result;
}

function alpacaHeaders(): Record<string, string> {
  return { "APCA-API-KEY-ID": config.alpacaKeyId ?? "", "APCA-API-SECRET-KEY": config.alpacaSecretKey ?? "" };
}

// --- Alpaca: market clock (shared across all symbols - one US equities session) ---

let clockCache: { isOpen: boolean; expiresAt: number } | null = null;
const CLOCK_CACHE_MS = 30000; // market state doesn't flip every second; avoid hammering /v2/clock

async function getMarketOpen(): Promise<boolean> {
  const now = Date.now();
  if (clockCache && clockCache.expiresAt > now) return clockCache.isOpen;
  if (!config.alpacaKeyId || !config.alpacaSecretKey) return false; // unknown state fails safe: closed
  const result = await fetchWithBackoff(`${config.alpacaTradingBaseUrl}/v2/clock`, alpacaHeaders());
  const isOpen = Boolean(result?.ok && (result.data as { is_open?: boolean } | null)?.is_open);
  clockCache = { isOpen, expiresAt: now + CLOCK_CACHE_MS };
  return isOpen;
}

// --- Alpaca: REST snapshot batch (realignment / primary path when WS has no live tick yet) ---

// Alpaca's exact max symbols per /v2/stocks/snapshots call isn't confirmed in the docs pages we
// could fetch (see docs/dx-report-notes.md); chunking conservatively rather than guessing a large number.
const ALPACA_SNAPSHOT_CHUNK = 50;

async function fetchAlpacaSnapshots(symbols: string[]): Promise<Map<string, ReferenceReading>> {
  const out = new Map<string, ReferenceReading>();
  if (!config.alpacaKeyId || !config.alpacaSecretKey || symbols.length === 0) return out;

  for (let i = 0; i < symbols.length; i += ALPACA_SNAPSHOT_CHUNK) {
    const chunk = symbols.slice(i, i + ALPACA_SNAPSHOT_CHUNK);
    const url = `${config.alpacaDataBaseUrl}/v2/stocks/snapshots?symbols=${encodeURIComponent(chunk.join(","))}&feed=${config.alpacaFeed}`;
    const result = await fetchWithBackoff(url, alpacaHeaders());
    if (!result?.ok || !result.data || typeof result.data !== "object") continue;
    for (const [symbol, snapshot] of Object.entries(result.data as Record<string, unknown>)) {
      const trade = (snapshot as { latestTrade?: { p?: number; t?: string } } | null)?.latestTrade;
      const price = Number(trade?.p);
      const ts = trade?.t ? Date.parse(trade.t) : NaN;
      if (Number.isFinite(price) && price > 0 && Number.isFinite(ts)) {
        out.set(symbol.toUpperCase(), { price, ts, source: "alpaca" });
      }
    }
  }
  return out;
}

// --- Alpaca: WebSocket live feed (optional live layer; REST snapshot above is the reliable floor) ---

const wsLiveCache = new Map<string, ReferenceReading>();
let wsSymbols: string[] = [];
let wsSocket: WebSocket | null = null;
let wsReconnectTimer: NodeJS.Timeout | null = null;

/** Starts (or restarts with a new symbol set) the Alpaca IEX trade stream. Capped at 30 symbols
 * per the brief; Alpaca's exact free-tier WS symbol cap wasn't independently confirmed (unverified -
 * see docs/dx-report-notes.md), so 30 is a deliberately conservative design choice, not a proven limit. */
export function startAlpacaStream(symbols: string[]): void {
  if (!config.alpacaKeyId || !config.alpacaSecretKey) return;
  wsSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))].slice(0, 30);
  if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
  wsSocket?.close();
  connectAlpacaStream();
}

function connectAlpacaStream(): void {
  if (!config.alpacaKeyId || !config.alpacaSecretKey || wsSymbols.length === 0) return;
  try {
    const socket = new WebSocket(`wss://stream.data.alpaca.markets/v2/${config.alpacaFeed}`);
    wsSocket = socket;
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ action: "auth", key: config.alpacaKeyId, secret: config.alpacaSecretKey }));
    });
    socket.addEventListener("message", (event) => {
      let messages: unknown;
      try {
        messages = JSON.parse(String(event.data));
      } catch {
        return;
      }
      for (const msg of Array.isArray(messages) ? messages : [messages]) {
        const frame = msg as { T?: string; msg?: string; S?: string; p?: number; t?: string };
        if (frame.T === "success" && frame.msg === "authenticated") {
          socket.send(JSON.stringify({ action: "subscribe", trades: wsSymbols }));
        } else if (frame.T === "t" && frame.S && typeof frame.p === "number") {
          const ts = frame.t ? Date.parse(frame.t) : Date.now();
          wsLiveCache.set(frame.S.toUpperCase(), { price: frame.p, ts, source: "alpaca" });
        } else if (frame.T === "error") {
          console.warn("[referencePrice] Alpaca WS error frame", frame);
        }
      }
    });
    socket.addEventListener("close", () => {
      wsSocket = null;
      wsReconnectTimer = setTimeout(connectAlpacaStream, 5000);
    });
    socket.addEventListener("error", () => {
      // "close" fires right after in the WebSocket spec; reconnect is scheduled there.
    });
  } catch (error) {
    console.warn("[referencePrice] Alpaca WS connect failed:", (error as Error).message);
    wsReconnectTimer = setTimeout(connectAlpacaStream, 5000);
  }
}

// --- Finnhub: REST quote fallback ---

// Finnhub free tier is 60 req/min (confirmed via community/aggregator sources, not a directly
// fetchable official docs page - see docs/dx-report-notes.md). A simple per-process counter keeps
// us comfortably under that without needing a full token-bucket for this MVP.
let finnhubCallsThisMinute = 0;
let finnhubWindowStartedAt = Date.now();
const FINNHUB_LIMIT_PER_MIN = 60;

function finnhubBudgetAvailable(): boolean {
  const now = Date.now();
  if (now - finnhubWindowStartedAt > 60000) {
    finnhubWindowStartedAt = now;
    finnhubCallsThisMinute = 0;
  }
  return finnhubCallsThisMinute < FINNHUB_LIMIT_PER_MIN;
}

async function fetchFinnhubQuote(symbol: string): Promise<ReferenceReading | null> {
  if (!config.finnhubApiKey || !finnhubBudgetAvailable()) return null;
  finnhubCallsThisMinute += 1;
  const url = `${config.finnhubBaseUrl}/quote?symbol=${encodeURIComponent(symbol)}&token=${config.finnhubApiKey}`;
  const result = await fetchWithBackoff(url, {});
  if (!result?.ok) return null;
  const data = result.data as { c?: number; t?: number } | null;
  const price = Number(data?.c);
  const ts = Number(data?.t) * 1000;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ts) || ts <= 0) return null;
  return { price, ts, source: "finnhub" };
}

// --- Public API ---

type CacheEntry = { price: ReferencePrice; expiresAt: number };
const priceCache = new Map<string, CacheEntry>();

function finalize(reading: ReferenceReading, marketOpen: boolean, crossCheckWarning?: string): ReferencePrice {
  return { ...reading, marketOpen, stale: isStale(Date.now(), reading.ts, config.referenceStaleMs), crossCheckWarning };
}

/**
 * Batched lookup - the primary entry point. Always prefer this over calling getReferencePrice in
 * a loop: one Alpaca snapshot call covers the whole list instead of one request per symbol (see
 * docs/arbitrage-and-data-fetching.md §B.3 "batch").
 */
export async function getReferencePrices(tickers: string[]): Promise<Map<string, ReferencePrice | null>> {
  const symbols = [...new Set(tickers.map((ticker) => ticker.toUpperCase()))];
  const now = Date.now();
  const out = new Map<string, ReferencePrice | null>();
  const needed: string[] = [];

  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached && cached.expiresAt > now) {
      out.set(symbol, cached.price);
    } else {
      needed.push(symbol);
    }
  }
  if (needed.length === 0) return out;

  const marketOpen = await getMarketOpen();

  // Live WS ticks first (freshest possible); only hit REST for symbols still missing/stale.
  const stillNeeded = needed.filter((symbol) => {
    const live = wsLiveCache.get(symbol);
    return !live || now - live.ts > config.referenceStaleMs;
  });

  const snapshots = await fetchAlpacaSnapshots(stillNeeded);

  for (const symbol of needed) {
    const live = wsLiveCache.get(symbol);
    const alpacaReading = live && now - live.ts <= config.referenceStaleMs ? live : (snapshots.get(symbol) ?? live ?? null);

    let finnhubReading: ReferenceReading | null = null;
    const alpacaUsable = alpacaReading && now - alpacaReading.ts <= config.referenceStaleMs;
    if (!alpacaUsable) {
      // Alpaca missing or stale -> fall back to Finnhub.
      finnhubReading = await fetchFinnhubQuote(symbol);
    }

    const chosen = selectReading([alpacaReading, finnhubReading]);
    if (!chosen) {
      out.set(symbol, null);
      continue;
    }
    const warning = crossCheck(alpacaReading ?? null, finnhubReading);
    if (warning) console.warn(`[referencePrice] cross-check mismatch for ${symbol}: ${warning}`);

    const price = finalize(chosen, marketOpen, warning);
    priceCache.set(symbol, { price, expiresAt: now + config.referencePriceCacheMs });
    out.set(symbol, price);
  }

  return out;
}

/** Single-symbol convenience wrapper (e.g. for a one-off manual lookup). Prefer getReferencePrices for scans. */
export async function getReferencePrice(ticker: string): Promise<ReferencePrice | null> {
  const result = await getReferencePrices([ticker]);
  return result.get(ticker.toUpperCase()) ?? null;
}

export function referencePriceProvidersConfigured(): { alpaca: boolean; finnhub: boolean } {
  return {
    alpaca: Boolean(config.alpacaKeyId && config.alpacaSecretKey),
    finnhub: Boolean(config.finnhubApiKey)
  };
}
