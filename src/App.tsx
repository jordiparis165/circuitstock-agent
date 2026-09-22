import {
  Activity,
  BadgeDollarSign,
  CheckCircle2,
  Cpu,
  FileSignature,
  Link2,
  PieChart,
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
    walletBalances?: boolean;
    officialApproval?: boolean;
    gasEstimated?: boolean;
    researchLoaded?: boolean;
    requiresUserSignature: boolean;
    broadcasted: boolean;
  };
  gasPrice?: { ok: boolean; data?: unknown } | null;
  gasLimit?: { ok: boolean; data?: unknown } | null;
  walletSnapshot?: { balances?: { ok?: boolean } | null; portfolio?: { ok?: boolean } | null };
  research?: {
    candleSummary?: {
      points: number;
      volatilityBps: number | null;
      changeBps: number | null;
      signal: string;
    } | null;
    underlyingProfile?: { ok?: boolean } | null;
    underlyingMarket?: { ok?: boolean } | null;
  };
  apiWarnings?: Array<{ kind?: string; message?: string; status?: number }>;
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

type Evidence = {
  ok: boolean;
  modules: string[];
  recentCalls: Array<{
    module: string;
    endpoint: string;
    status: "ok" | "failed";
    latencyMs: number;
    at: string;
    note?: string;
  }>;
};

type AgentInterpretation = {
  ok: boolean;
  spokenSummary?: string;
  intent?: {
    symbol: string;
    side: string;
    amountUsd: number;
    quoteOnly: boolean;
    researchOnly: boolean;
  };
  execution?: ExecutionPreview | null;
};

type WatcherStatus = {
  enabled: boolean;
  running: boolean;
  killed: boolean;
  lastTickAt: string | null;
  spentTodayUsd: number;
  policy: {
    mode: "dry-run" | "live";
    intervalSec: number;
    minSpreadBps: number;
    minScore: number;
    minLiquidityUsd: number;
    maxTradeUsd: number;
    maxDailyUsd: number;
    maxSlippageBps: number;
    cooldownSec: number;
    allowedSymbols: string[];
    walletAddress?: string;
  };
  decisions: Array<{
    at: string;
    symbol: string | null;
    side: "buy" | "sell" | null;
    amountUsd: number;
    outcome: "would-execute" | "executed" | "skipped" | "idle" | "error";
    reasons: string[];
  }>;
};

type BasketPlan = {
  ok: boolean;
  theme: string;
  label: string;
  thesis: string;
  risk: "balanced" | "aggressive";
  amountUsd: number;
  cacheStatus: string;
  requiredUserAction: string;
  summary: string;
  legs: Array<{
    symbol: string;
    name: string;
    tokenSource: string;
    tokenAddress: string;
    allocationUsd: number;
    weightPct: number;
    action: "buy" | "watch";
    spreadBps: number;
    liquidityUsd: number;
    score: number;
    reason: string;
  }>;
};

type Readiness = {
  ok: boolean;
  links: Record<string, string>;
  checklist: Array<{ item: string; status: "ready" | "todo" | "missing" }>;
};

type ViewId = "monitor" | "wallet" | "agent" | "baskets" | "risk";

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
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [risk, setRisk] = useState<"balanced" | "aggressive">("balanced");
  const [platform, setPlatform] = useState<"bstock" | "ondo">("bstock");
  const [tab, setTab] = useState(9);
  const [maxTradeUsd, setMaxTradeUsd] = useState(10);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewId>("monitor");
  const [agentPrompt, setAgentPrompt] = useState("Quote only: buy $10 of TSLA tokenized stock");
  const [agentReply, setAgentReply] = useState<AgentInterpretation | null>(null);
  const [firstStockSymbol, setFirstStockSymbol] = useState("TSLA");
  const [firstStockAmount, setFirstStockAmount] = useState(10);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [watcherMessage, setWatcherMessage] = useState<string | null>(null);
  const [basketTheme, setBasketTheme] = useState("ai-chips");
  const [basketAmount, setBasketAmount] = useState(25);
  const [basket, setBasket] = useState<BasketPlan | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

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
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
    getJson<WatcherStatus>("/api/watcher/status").then(setWatcher).catch(() => undefined);
    getJson<Readiness>("/api/judge/readiness").then(setReadiness).catch(() => undefined);
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
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }

  async function verifyTxHash() {
    if (!txHash.trim()) return;
    try {
      const status = await getJson<unknown>(`/api/tx/status/${txHash.trim()}`);
      setTxStatus(JSON.stringify(status, null, 2));
    } catch (error) {
      setTxStatus(error instanceof Error ? error.message : "Unable to verify transaction.");
    }
  }

  async function signTransaction(label: "approval" | "swap", tx?: PreparedTx | null) {
    if (!window.ethereum || !tx) return;
    const payload = JSON.stringify(tx, null, 2);
    try {
      const signature = await window.ethereum.request<string>({ method: "eth_signTransaction", params: [tx] });
      setSignatureResult(`${label} signature: ${signature}`);
    } catch (error) {
      try {
        await navigator.clipboard?.writeText(payload);
      } catch {
        // Clipboard is optional; the payload is still displayed below.
      }
      const reason =
        error instanceof Error
          ? error.message
          : "Wallet declined or does not support eth_signTransaction.";
      setSignatureResult(
        `${label} raw signing is unavailable in this wallet: ${reason}\n\nNo broadcast was performed. The transaction payload was copied when clipboard access was available:\n${payload}`
      );
    }
  }

  async function interpretAgentPrompt() {
    const data = await getJson<AgentInterpretation>("/api/agent/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: agentPrompt, walletAddress })
    });
    setAgentReply(data);
    if (data.execution) setPreview(data.execution);
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }

  async function prepareFirstStock(symbol = firstStockSymbol) {
    const prompt = `Quote only: buy $${firstStockAmount} of ${symbol} tokenized stock`;
    setAgentPrompt(prompt);
    const data = await getJson<AgentInterpretation>("/api/agent/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, walletAddress })
    });
    setAgentReply(data);
    if (data.execution) setPreview(data.execution);
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }

  async function watcherAction(action: "tick" | "kill" | "resume") {
    const data = await getJson<{ decision?: WatcherStatus["decisions"][number]; status?: WatcherStatus } | WatcherStatus>(
      action === "tick" ? "/api/watcher/tick" : `/api/watcher/${action}`,
      { method: "POST" }
    );
    const nextStatus = "status" in data && data.status ? data.status : (data as WatcherStatus);
    setWatcher(nextStatus);
    if ("decision" in data && data.decision) {
      setWatcherMessage(`${data.decision.outcome}: ${data.decision.reasons.join("; ")}`);
    } else {
      setWatcherMessage(action === "kill" ? "Kill switch enabled." : "Watcher resumed.");
    }
  }

  async function planBasket() {
    const data = await getJson<BasketPlan>("/api/baskets/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: basketTheme, amountUsd: basketAmount, risk, platforms: [platform] })
    });
    setBasket(data);
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
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
  const navItems: Array<{ id: ViewId; label: string; icon: typeof Activity }> = [
    { id: "monitor", label: "Monitor", icon: Activity },
    { id: "wallet", label: "Wallet Skills", icon: WalletCards },
    { id: "agent", label: "Agent Studio", icon: Cpu },
    { id: "baskets", label: "Baskets", icon: PieChart },
    { id: "risk", label: "Risk Rules", icon: ShieldCheck }
  ];

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
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
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
            <small>BSC mainnet only. Small demo amounts. Not financial advice. Restricted jurisdictions must not use this flow.</small>
          </div>
          <button onClick={connectWallet}>
            <Link2 size={18} />
            {walletAddress ? "Wallet connected" : "Connect wallet"}
          </button>
        </section>

        <section className="firstStockPanel">
          <div>
            <p className="eyebrow">First stock flow</p>
            <h2>Preview a first tokenized stock purchase</h2>
            <span>Pick a familiar stock, quote a small USDC route, simulate it, then sign only if the wallet supports raw transaction signing.</span>
          </div>
          <div className="firstStockControls">
            <label>
              Amount
              <input type="number" min={1} max={100} value={firstStockAmount} onChange={(event) => setFirstStockAmount(Number(event.target.value))} />
            </label>
            <select value={firstStockSymbol} onChange={(event) => setFirstStockSymbol(event.target.value)}>
              <option value="TSLA">Tesla</option>
              <option value="NVDA">Nvidia</option>
              <option value="MSFT">Microsoft</option>
              <option value="SPY">S&P 500 ETF</option>
            </select>
            <button onClick={() => prepareFirstStock()}>
              <BadgeDollarSign size={18} />
              Preview buy
            </button>
          </div>
          <div className="quickStocks">
            {["TSLA", "NVDA", "MSFT", "SPY"].map((symbol) => (
              <button key={symbol} onClick={() => prepareFirstStock(symbol)}>
                {symbol}
              </button>
            ))}
          </div>
        </section>

        {activeView !== "monitor" && (
          <section className="viewPanel">
            {activeView === "wallet" && (
              <>
                <div>
                  <p className="eyebrow">Wallet Skills</p>
                  <h2>Skill-ready actions</h2>
                </div>
                <div className="infoGrid">
                  <div><strong>scan_tokenized_stock_spreads</strong><span>Calls `/api/agent/recommend/compact` with risk, platform, tabs and max trade size.</span></div>
                  <div><strong>prepare_rebalance</strong><span>Calls `/api/execution/prepare` and returns quote, approval, gas, simulation and no-broadcast checklist.</span></div>
                  <div><strong>Safety boundary</strong><span>The skill never broadcasts. The wallet or user must explicitly handle any final action.</span></div>
                </div>
              </>
            )}
            {activeView === "agent" && (
              <>
                <div>
                  <p className="eyebrow">Agent Studio</p>
                  <h2>Runtime integration shape</h2>
                </div>
                <div className="infoGrid">
                  <div><strong>Compact payload</strong><span>Recommendation, reason, confidence, required user action and transaction preview.</span></div>
                  <div><strong>Monitoring loop</strong><span>Schedule `/api/agent/recommend` and escalate only when spread, liquidity and risk rules pass.</span></div>
                  <div><strong>Evidence trail</strong><span>`/api/evidence` shows Binance modules, endpoints, status and latency for judge review.</span></div>
                </div>
                <div className="agentPrompt">
                  <input value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} />
                  <button onClick={interpretAgentPrompt}>Run prompt</button>
                </div>
                {agentReply && (
                  <div className="statusBox">
                    <strong>{agentReply.spokenSummary}</strong>
                    <span>
                      Intent: {agentReply.intent?.side} {agentReply.intent?.symbol} - ${agentReply.intent?.amountUsd} - no broadcast
                    </span>
                  </div>
                )}
                <div className="watcherPanel">
                  <div>
                    <p className="eyebrow">Autonomous runtime</p>
                    <h2>Dry-run watcher</h2>
                    <span>
                      Policy-gated monitor with whitelist, spread threshold, liquidity floor, daily budget, cooldown and kill switch. It refuses live execution until an executor is wired.
                    </span>
                  </div>
                  <div className="watcherStats">
                    <div><span>Status</span><strong>{watcher?.enabled ? (watcher.running ? "running" : "enabled") : "disabled"}</strong></div>
                    <div><span>Mode</span><strong>{watcher?.policy.mode ?? "dry-run"}</strong></div>
                    <div><span>Kill switch</span><strong>{watcher?.killed ? "on" : "off"}</strong></div>
                    <div><span>Daily spent</span><strong>{currency.format(watcher?.spentTodayUsd ?? 0)}</strong></div>
                    <div><span>Min spread</span><strong>{watcher?.policy.minSpreadBps ?? "--"} bps</strong></div>
                    <div><span>Max trade</span><strong>{currency.format(watcher?.policy.maxTradeUsd ?? 0)}</strong></div>
                  </div>
                  <div className="watcherActions">
                    <button onClick={() => watcherAction("tick")}>Run dry-run tick</button>
                    <button onClick={() => watcherAction("kill")}>Kill</button>
                    <button onClick={() => watcherAction("resume")}>Resume</button>
                  </div>
                  <div className="evidenceRows">
                    {watcherMessage && <span><strong>Latest action</strong>{watcherMessage}</span>}
                    {watcher?.decisions?.slice(0, 4).map((decision) => (
                      <span key={`${decision.at}-${decision.symbol ?? "none"}`}>
                        <strong>{decision.outcome} {decision.symbol ?? ""}</strong>
                        {decision.reasons.join("; ")}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
            {activeView === "baskets" && (
              <>
                <div>
                  <p className="eyebrow">Thematic baskets</p>
                  <h2>One-tap tokenized stock basket plan</h2>
                </div>
                <div className="basketControls">
                  <label>
                    Theme
                    <select value={basketTheme} onChange={(event) => setBasketTheme(event.target.value)}>
                      <option value="ai-chips">AI Chips</option>
                      <option value="magnificent-7">Magnificent 7</option>
                      <option value="etf">ETF Core</option>
                      <option value="buffett">Buffett Portfolio</option>
                    </select>
                  </label>
                  <label>
                    Basket USD
                    <input type="number" min={5} max={250} value={basketAmount} onChange={(event) => setBasketAmount(Number(event.target.value))} />
                  </label>
                  <button onClick={planBasket}>Plan basket</button>
                </div>
                {basket ? (
                  <div className="basketPanel">
                    <div className="statusBox">
                      <strong>{basket.label}: {basket.summary}</strong>
                      <span>{basket.thesis} {basket.requiredUserAction}</span>
                    </div>
                    <div className="basketRows">
                      {basket.legs.map((leg) => (
                        <article key={leg.symbol}>
                          <div>
                            <strong>{leg.symbol}</strong>
                            <span>{currency.format(leg.allocationUsd)} - {leg.weightPct}%</span>
                          </div>
                          <p>{leg.reason}</p>
                          <small>{leg.action} - spread {leg.spreadBps} bps - liquidity {compactUsd.format(leg.liquidityUsd)}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="statusBox">
                    <strong>Basket planner ready</strong>
                    <span>Builds a BSC-only, spot-only, no-broadcast basket using the same live RWA scanner.</span>
                  </div>
                )}
              </>
            )}
            {activeView === "risk" && (
              <>
                <div>
                  <p className="eyebrow">Risk Rules</p>
                  <h2>Execution guardrails</h2>
                </div>
                <div className="infoGrid">
                  <div><strong>Small size</strong><span>Default trade size is $10 and capped by the max trade input.</span></div>
                  <div><strong>Pre-flight checks</strong><span>Wallet balances, official approval payload, gas checks and simulation run before signing.</span></div>
                  <div><strong>No broadcast</strong><span>Signing is optional. If raw signing is unsupported, CircuitStock displays and copies the payload.</span></div>
                </div>
              </>
            )}
          </section>
        )}

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
              <option value={12}>Buffett Portfolio</option>
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
                    <small>Score {action.score ?? "--"} - {action.tokenAddress ? shortAddress(action.tokenAddress) : "live token"}</small>
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
                  ["Wallet checked", preview?.checklist?.walletBalances],
                  ["Official approval API", preview?.checklist?.officialApproval],
                  ["Approval calldata", preview?.checklist?.approvalCalldata],
                  ["Swap calldata", preview?.checklist?.swapBuilt],
                  ["Gas estimated", preview?.checklist?.gasEstimated],
                  ["Research loaded", preview?.checklist?.researchLoaded],
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

              <div className="quoteCards">
                <div>
                  <span>24h volatility</span>
                  <strong>{preview?.research?.candleSummary?.volatilityBps ?? "--"} bps</strong>
                </div>
                <div>
                  <span>24h momentum</span>
                  <strong>{preview?.research?.candleSummary?.changeBps ?? "--"} bps</strong>
                </div>
                <div>
                  <span>Gas APIs</span>
                  <strong>{preview?.gasPrice || preview?.gasLimit ? "checked" : "--"}</strong>
                </div>
                <div>
                  <span>Wallet APIs</span>
                  <strong>{preview?.walletSnapshot?.balances ? "checked" : walletAddress ? "unavailable" : "connect wallet"}</strong>
                </div>
              </div>

              <div className="signGrid">
                <button className="signButton" onClick={() => signTransaction("approval", preview?.approvalTx)} disabled={!preview?.approvalTx}>
                  <FileSignature size={18} />
                  Sign/copy approval
                </button>
                <button className="signButton" onClick={() => signTransaction("swap", preview?.swapTx ?? preview?.evmTx)} disabled={!preview?.swapTx && !preview?.evmTx}>
                  <FileSignature size={18} />
                  Sign/copy swap
                </button>
              </div>

              {signatureResult && <pre className="quotePreview">{signatureResult}</pre>}
              {preview?.apiWarnings?.length ? (
                <div className="warningList">
                  {preview.apiWarnings.slice(0, 4).map((warning, index) => (
                    <span key={`${warning.kind}-${index}`}>{warning.kind ?? "api_warning"}: {warning.message ?? warning.status ?? "review"}</span>
                  ))}
                </div>
              ) : null}
              {preview?.error && <p className="empty">{preview.error}</p>}
            </section>
          </div>
        </section>

        <section className="apiEvidence">
          <div><strong>RWA Data API</strong><span>/rwa/tokens + /underlying-profile + /underlying-market</span></div>
          <div><strong>RWA Search</strong><span>/rwa/platforms + /rwa/search ticker resolution</span></div>
          <div><strong>Market API</strong><span>/market/candles volatility and momentum</span></div>
          <div><strong>Trading API</strong><span>/quote + /approve-transaction + /swap + /history</span></div>
          <div><strong>Transaction API</strong><span>/gas-price + /gas-limit + /simulate</span></div>
          <div><strong>Wallet API</strong><span>/balance + /portfolio before trade</span></div>
          <div><strong>Agent endpoint</strong><span>/api/agent/recommend/compact</span></div>
          <div><strong>b402 hook</strong><span>/api/b402/manifest + /api/premium/signal</span></div>
          <div><strong>Basket engine</strong><span>/api/baskets/plan thematic allocations</span></div>
          <div><strong>Judge smoke</strong><span>/api/judge/readiness + /api/judge/smoke</span></div>
        </section>

        <section className="opsPanel">
          <div>
            <p className="eyebrow">API evidence</p>
            <h2>Last successful calls</h2>
            <div className="evidenceRows">
              {evidence?.recentCalls?.slice(0, 8).map((call) => (
                <span key={`${call.endpoint}-${call.at}`}>
                  <strong>{call.module}</strong>
                  {call.status} - {call.latencyMs} ms - {call.endpoint}
                </span>
              )) ?? <span>No calls yet.</span>}
            </div>
          </div>
          <div>
            <p className="eyebrow">Judge readiness</p>
            <h2>Submission checklist</h2>
            <div className="readinessRows">
              {readiness?.checklist.slice(0, 7).map((item) => (
                <span className={item.status} key={item.item}>
                  <CheckCircle2 size={15} />
                  {item.item}
                </span>
              )) ?? <span className="todo">Loading checklist</span>}
            </div>
          </div>
          <div>
            <p className="eyebrow">Post-trade verifier</p>
            <h2>Paste tx hash</h2>
            <div className="txVerifier">
              <input value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x..." />
              <button onClick={verifyTxHash}>Verify</button>
            </div>
            {txStatus && <pre className="quotePreview">{txStatus}</pre>}
          </div>
        </section>
      </section>
    </main>
  );
}
