import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Cpu,
  FileSignature,
  Link2,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Health = {
  ok: boolean;
  apiConfigured: boolean;
  apiKeyStatus: "configured" | "missing";
  quotePathConfigured: boolean;
  baseUrl: string;
  bscRpcUrl: string;
};

type Quote = {
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

type StrategyAction = {
  symbol: string;
  action: "buy" | "trim" | "watch";
  reason: string;
  simulatedUsd: number;
  score?: number;
  tokenAddress?: string;
  nextStep: string;
};

type Strategy = {
  mode: string;
  risk: "balanced" | "aggressive";
  actions: StrategyAction[];
  rules: {
    maxTradeUsd: number;
    minScore?: number;
    requiresSimulation: boolean;
    requiresUserSignature: boolean;
    broadcasted?: boolean;
  };
};

type PreparedTx = {
  from?: string;
  to: string;
  value?: string;
  data?: string;
  gas?: string;
};

type ExecutionPreview = {
  ok: boolean;
  mode?: string;
  error?: string;
  humanStatus?: string;
  nextRequiredAction?: string;
  selectedQuote?: {
    quoteId?: string;
    vendorName?: string;
    toTokenAmount?: string;
    priceImpactPercent?: string;
    estimateGasFee?: string;
    approveTarget?: string;
    router?: string;
  };
  approvalTx?: PreparedTx | null;
  swapTx?: PreparedTx | null;
  evmTx?: PreparedTx | null;
  checklist?: {
    quote: boolean;
    approvalCalldata?: boolean;
    swapBuilt: boolean;
    simulated: boolean;
    requiresUserSignature: boolean;
    broadcasted: boolean;
  };
  simulationSummary?: {
    status?: string;
    failReason?: string;
    humanStatus?: string;
    nextRequiredAction?: string;
    severity?: string;
  } | null;
  request?: {
    symbol: string;
    side: string;
    amountUsd: number;
    walletAddress?: string;
  };
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const compactUsd = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function shortAddress(value?: string | null) {
  if (!value) return "--";
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [marketMode, setMarketMode] = useState("loading");
  const [cacheStatus, setCacheStatus] = useState("loading");
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [signatureResult, setSignatureResult] = useState<string | null>(null);
  const [risk, setRisk] = useState<"balanced" | "aggressive">("balanced");
  const [platform, setPlatform] = useState<"bstock" | "ondo">("bstock");
  const [tab, setTab] = useState(9);
  const [maxTradeUsd, setMaxTradeUsd] = useState(10);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [healthData, marketData] = await Promise.all([
      getJson<Health>("/api/health"),
      getJson<{ mode: string; cacheStatus?: string; quotes: Quote[] }>("/api/market")
    ]);
    setHealth(healthData);
    setQuotes(marketData.quotes);
    setMarketMode(marketData.mode);
    setCacheStatus(marketData.cacheStatus ?? "live");
    setLoading(false);
  }

  async function runStrategy(selectedRisk = risk) {
    const data = await getJson<Strategy>("/api/strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk: selectedRisk, maxTradeUsd, platforms: [platform], tabs: [tab] })
    });
    setStrategy(data);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      setPreview({ ok: false, mode: "wallet_missing", error: "No injected wallet found. Install Binance Wallet or MetaMask." });
      return;
    }

    const accounts = await window.ethereum.request<string[]>({ method: "eth_requestAccounts" });
    const account = accounts[0];
    setWalletAddress(account);

    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org"],
            blockExplorerUrls: ["https://bscscan.com"]
          }
        ]
      });
    }
  }

  async function prepareExecution(action: StrategyAction) {
    const data = await getJson<ExecutionPreview>("/api/execution/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: action.symbol,
        side: action.action === "trim" ? "sell" : "buy",
        amountUsd: action.simulatedUsd,
        walletAddress
      })
    });
    setPreview(data);
    setSignatureResult(null);
  }

  async function signTransaction(label: "approval" | "swap", tx?: PreparedTx | null) {
    if (!window.ethereum || !tx) return;
    try {
      const signature = await window.ethereum.request<string>({ method: "eth_signTransaction", params: [tx] });
      setSignatureResult(`${label} signature: ${signature}`);
    } catch (error) {
      setSignatureResult(
        error instanceof Error
          ? `${label} signature unavailable: ${error.message}`
          : `${label} signature unavailable. Wallet declined or does not support eth_signTransaction.`
      );
    }
  }

  useEffect(() => {
    refresh().then(() => runStrategy("balanced"));
  }, []);

  useEffect(() => {
    runStrategy(risk);
  }, [platform, tab, maxTradeUsd]);

  const bestSpread = useMemo(() => {
    if (!quotes.length) return null;
    return [...quotes].sort((a, b) => Math.abs(b.spreadBps) - Math.abs(a.spreadBps))[0];
  }, [quotes]);

  const statusText = preview?.humanStatus ?? preview?.simulationSummary?.humanStatus ?? preview?.error ?? "Prepare an action to inspect execution.";

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CS</div>
          <div>
            <strong>CircuitStock</strong>
            <span>Agentic tokenized stocks</span>
          </div>
        </div>
        <nav>
          <a className="active"><Activity size={18} /> Monitor</a>
          <a><WalletCards size={18} /> Wallet Skills</a>
          <a><Cpu size={18} /> Agent Studio</a>
          <a><ShieldCheck size={18} /> Risk Rules</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">BNB Hack: Tokenized Stocks Edition</p>
            <h1>On-chain/reference spread agent for BSC stocks</h1>
          </div>
          <button className="iconButton" onClick={() => refresh().then(() => runStrategy(risk))} title="Refresh data" aria-label="Refresh data">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </header>

        <section className="metrics">
          <div>
            <span>API key</span>
            <strong>{health?.apiConfigured ? health.apiKeyStatus : "Missing"}</strong>
            <small>Server-side only</small>
          </div>
          <div>
            <span>Market data</span>
            <strong>{marketMode}</strong>
            <small>{cacheStatus}</small>
          </div>
          <div>
            <span>Largest spread</span>
            <strong>{bestSpread ? `${bestSpread.spreadBps} bps` : "--"}</strong>
            <small>{bestSpread?.symbol ?? "Waiting for quotes"}</small>
          </div>
          <div>
            <span>Wallet</span>
            <strong>{walletAddress ? shortAddress(walletAddress) : "Disconnected"}</strong>
            <small>BSC mainnet</small>
          </div>
        </section>

        <section className="walletBand">
          <div>
            <strong>Execution boundary</strong>
            <span>Quote, approval calldata, swap calldata and simulation are live. User signs only; CircuitStock never broadcasts.</span>
          </div>
          <button onClick={connectWallet}>
            <Link2 size={18} />
            {walletAddress ? "Wallet connected" : "Connect wallet"}
          </button>
        </section>

        <section className="filters">
          <SlidersHorizontal size={18} />
          <label>
            Platform
            <select value={platform} onChange={(event) => setPlatform(event.target.value as "bstock" | "ondo")}>
              <option value="bstock">bStocks</option>
              <option value="ondo">Ondo</option>
            </select>
          </label>
          <label>
            Sector
            <select value={tab} onChange={(event) => setTab(Number(event.target.value))}>
              <option value={9}>Magnificent 7</option>
              <option value={4}>AI Chips</option>
              <option value={11}>ETF</option>
            </select>
          </label>
          <label>
            Max trade
            <input type="number" min={1} max={100} value={maxTradeUsd} onChange={(event) => setMaxTradeUsd(Number(event.target.value))} />
          </label>
        </section>

        <section className="workbench">
          <div className="panel wide">
            <div className="panelHead">
              <div>
                <p className="eyebrow">Opportunity scanner</p>
                <h2>Tokenized stock spreads</h2>
              </div>
              <BadgeDollarSign size={22} />
            </div>
            <div className="table">
              <div className="row head">
                <span>Asset</span>
                <span>Source</span>
                <span>On-chain</span>
                <span>Reference</span>
                <span>Spread</span>
              </div>
              {quotes.map((quote) => (
                <div className="row" key={quote.symbol}>
                  <span>
                    <strong>{quote.symbol}</strong>
                    <small>{quote.name}</small>
                  </span>
                  <span>{quote.tokenSource}</span>
                  <span>{currency.format(quote.onchainPrice)}</span>
                  <span>{currency.format(quote.referencePrice)}</span>
                  <span className={quote.spreadBps > 0 ? "positive" : "negative"}>{quote.spreadBps} bps</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">Agent recommendation</p>
                <h2>Rebalance preview</h2>
              </div>
              <TrendingUp size={22} />
            </div>

            <div className="segmented" aria-label="Risk profile">
              {(["balanced", "aggressive"] as const).map((option) => (
                <button
                  key={option}
                  className={risk === option ? "selected" : ""}
                  onClick={() => {
                    setRisk(option);
                    runStrategy(option);
                  }}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="actions">
              {strategy?.actions.length ? (
                strategy.actions.map((action) => (
                  <article key={action.symbol}>
                    <div>
                      <strong>{action.action.toUpperCase()} {action.symbol}</strong>
                      <span>{currency.format(action.simulatedUsd)}</span>
                    </div>
                    <p>{action.reason}</p>
                    <small>Score {action.score ?? "--"} · {action.tokenAddress ? shortAddress(action.tokenAddress) : "live token"}</small>
                    <button className="quoteButton" onClick={() => prepareExecution(action)} disabled={action.action === "watch"}>
                      Prepare execution
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty">No spread clears the current risk rules.</p>
              )}
            </div>

            <div className="guardrails">
              <CheckCircle2 size={18} />
              <span>Simulation first. Approval and swap signatures only. No broadcast.</span>
            </div>

            <section className="executionPreview">
              <div className="statusBox">
                <strong>{statusText}</strong>
                <span>{preview?.nextRequiredAction ?? preview?.simulationSummary?.nextRequiredAction ?? "Connect a wallet for full calldata and simulation."}</span>
              </div>

              <div className="checklist">
                {[
                  ["Live RWA data", marketMode === "live"],
                  ["Quote", preview?.checklist?.quote],
                  ["Approval calldata", preview?.checklist?.approvalCalldata],
                  ["Swap calldata", preview?.checklist?.swapBuilt],
                  ["Simulation", preview?.checklist?.simulated],
                  ["User signature only", preview?.checklist?.requiresUserSignature],
                  ["No broadcast", preview?.checklist?.broadcasted === false]
                ].map(([label, done]) => (
                  <span className={done ? "done" : ""} key={String(label)}>
                    <CheckCircle2 size={15} />
                    {label}
                  </span>
                ))}
              </div>

              {preview?.selectedQuote && (
                <div className="quoteCards">
                  <div><span>Quote ID</span><strong>{preview.selectedQuote.quoteId ?? "--"}</strong></div>
                  <div><span>Vendor</span><strong>{preview.selectedQuote.vendorName ?? "--"}</strong></div>
                  <div><span>Price impact</span><strong>{preview.selectedQuote.priceImpactPercent ?? "0"}%</strong></div>
                  <div><span>Approve target</span><strong>{shortAddress(preview.selectedQuote.approveTarget)}</strong></div>
                </div>
              )}

              <div className="signGrid">
                <button className="signButton" onClick={() => signTransaction("approval", preview?.approvalTx)} disabled={!preview?.approvalTx}>
                  <FileSignature size={18} />
                  Sign approval only
                </button>
                <button className="signButton" onClick={() => signTransaction("swap", preview?.swapTx ?? preview?.evmTx)} disabled={!preview?.swapTx && !preview?.evmTx}>
                  <FileSignature size={18} />
                  Sign swap only
                </button>
              </div>

              {signatureResult && <pre className="quotePreview">{signatureResult}</pre>}
              {preview?.error && <p className="empty">{preview.error}</p>}
            </section>
          </div>
        </section>

        <section className="apiEvidence">
          <div><strong>RWA Data API</strong><span>/api/v1/dex/market/rwa/tokens</span></div>
          <div><strong>Trading API</strong><span>/api/v1/dex/aggregator/quote + /swap</span></div>
          <div><strong>Transaction API</strong><span>/api/v1/dex/pre-transaction/simulate</span></div>
          <div><strong>Agent endpoint</strong><span>/api/agent/recommend/compact</span></div>
        </section>
      </section>
    </main>
  );
}
