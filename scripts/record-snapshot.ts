/**
 * Records a real snapshot of cross-issuer tokenized-stock prices from the Binance Web3 RWA API.
 *
 * This is what feeds replay mode. Nothing here is hand-written: every price, address, ratio and
 * market state comes from the API response, and the capture time is stamped so the UI can say how
 * old the data is.
 *
 * Requires the API to be running (npm run dev), since the signing and rate-limit handling live
 * there - the recorder deliberately does not hold a second copy of the Binance client.
 *
 *   npx tsx scripts/record-snapshot.ts            # writes fixtures/snapshot.sample.json
 *   npx tsx scripts/record-snapshot.ts --archive  # also writes data/snapshots/<date>/<HHMM>.json
 *   API_BASE=https://... npx tsx scripts/record-snapshot.ts
 *
 * Price per share is tokenPrice / tokenToShareRatio: a token is not always one share, and
 * comparing raw token prices across issuers with different ratios is the classic way to read a
 * spread that does not exist.
 */

import fs from "node:fs";
import path from "node:path";

const API_BASE = process.env.API_BASE ?? "http://localhost:8787";

type RwaToken = {
  underlyingTicker?: string;
  tokenSymbol?: string;
  tokenContractAddress?: string;
  binanceChainId?: string | number;
  platformId?: string;
  tokenPrice?: string | number;
  tokenToShareRatio?: string | number;
  statusInfo?: {
    openState?: boolean;
    marketStatus?: string | null;
    reasonCode?: string | null;
    nextOpenTime?: number | null;
    nextCloseTime?: number | null;
  };
};

/** `openState` means "this token is tradable", not "the US session is open" - a token can be
 *  tradable while its underlying market is closed. Only marketStatus answers the session question,
 *  and bStock reports it as null, so absence is treated as unknown rather than open. */
function sessionIsOpen(status: RwaToken["statusInfo"]): boolean {
  const state = (status?.marketStatus ?? "").toLowerCase();
  return state === "open" || state === "regular" || state === "trading";
}

const BSC = "56";

function pricePerShare(token: RwaToken): number | null {
  const price = Number(token.tokenPrice);
  const ratio = Number(token.tokenToShareRatio);
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return price / ratio;
}

async function main() {
  const archive = process.argv.includes("--archive");
  const response = await fetch(`${API_BASE}/api/rwa/tokens?platform=all`);
  if (!response.ok) throw new Error(`${API_BASE}/api/rwa/tokens returned HTTP ${response.status}. Is the API running?`);
  const body = (await response.json()) as { data?: RwaToken[] };
  const list = body.data ?? [];
  if (list.length === 0) throw new Error("The RWA endpoint returned no tokens; refusing to write an empty snapshot.");

  // Group BSC tokens by underlying ticker, keeping one entry per issuer.
  const byTicker = new Map<string, { ondo?: RwaToken; bstock?: RwaToken }>();
  for (const token of list) {
    const ticker = token.underlyingTicker;
    const platform = token.platformId;
    if (!ticker || String(token.binanceChainId) !== BSC) continue;
    if (platform !== "ondo" && platform !== "bstock") continue;
    if (pricePerShare(token) === null) continue;
    const entry = byTicker.get(ticker) ?? {};
    if (!entry[platform]) entry[platform] = token;
    byTicker.set(ticker, entry);
  }

  const pairs = [];
  let marketOpen = false;
  let marketState = "unknown";
  let nextOpen = 0;
  let nextClose = 0;

  for (const [ticker, entry] of byTicker) {
    if (!entry.ondo || !entry.bstock) continue; // a spread needs both issuers
    const ondoPrice = pricePerShare(entry.ondo)!;
    const bstockPrice = pricePerShare(entry.bstock)!;
    const cheap = Math.min(ondoPrice, bstockPrice);
    const rich = Math.max(ondoPrice, bstockPrice);

    // Market state is reported per token. Prefer whichever issuer actually reports a session
    // state (bStock leaves marketStatus null), and never infer "open" from tradability alone.
    const status = entry.ondo.statusInfo?.marketStatus ? entry.ondo.statusInfo : entry.bstock.statusInfo;
    if (sessionIsOpen(status)) marketOpen = true;
    if (status?.marketStatus) marketState = status.marketStatus;
    if (status?.nextOpenTime) nextOpen = Math.floor(Number(status.nextOpenTime) / 1000);
    if (status?.nextCloseTime) nextClose = Math.floor(Number(status.nextCloseTime) / 1000);

    pairs.push({
      ticker,
      chain: BSC,
      a: {
        platform: "ondo" as const,
        address: String(entry.ondo.tokenContractAddress),
        price_per_share: ondoPrice.toFixed(2),
        price_age_s: 0,
        liquidity_usd: "0"
      },
      b: {
        platform: "bstock" as const,
        address: String(entry.bstock.tokenContractAddress),
        price_per_share: bstockPrice.toFixed(2),
        price_age_s: 0,
        liquidity_usd: "0"
      },
      gross_spread_pct: (((rich - cheap) / cheap) * 100).toFixed(4),
      // Kept per pair: a token can stay tradable on-chain while its underlying market is closed.
      tradable: Boolean(entry.ondo.statusInfo?.openState || entry.bstock.statusInfo?.openState),
      // No independent reference is written unless one was actually fetched. A null here makes
      // the UI show "reference unavailable" instead of a premium computed against nothing.
      reference: null
    });
  }

  pairs.sort((a, b) => Number(b.gross_spread_pct) - Number(a.gross_spread_pct));

  const snapshot = {
    ts: Math.floor(Date.now() / 1000),
    mode: "paper",
    recordedFrom: "binance-web3-rwa",
    market: { open: marketOpen, state: marketState, next_open: nextOpen, next_close: nextClose },
    pairs
  };

  const out = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(path.resolve(process.cwd(), "fixtures/snapshot.sample.json"), out);
  console.log(`Wrote fixtures/snapshot.sample.json - ${pairs.length} cross-issuer pairs, market ${marketState}.`);

  if (archive) {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const hhmm = now.toISOString().slice(11, 16).replace(":", "");
    const dir = path.resolve(process.cwd(), "data/snapshots", day);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${hhmm}.json`), out);
    console.log(`Archived to data/snapshots/${day}/${hhmm}.json`);
  }

  for (const pair of pairs.slice(0, 8)) {
    console.log(`  ${pair.ticker.padEnd(6)} ondo ${pair.a.price_per_share.padStart(8)}  bstock ${pair.b.price_per_share.padStart(8)}  spread ${pair.gross_spread_pct}%`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
