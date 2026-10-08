import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  FileSignature,
  SlidersHorizontal,
  TrendingUp
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import {
  currency,
  getJson,
  shortAddress,
  type AgentInterpretation,
  type ExecutionPreview,
  type PreparedTx,
  type Strategy,
  type StrategyAction
} from "../lib/api";
import { useShell } from "../lib/shell";

export function MonitorPage() {
  const { quotes, marketMode, walletAddress, risk, setRisk, platform, setPlatform, tab, setTab, maxTradeUsd, setMaxTradeUsd } = useShell();

  const [spreadSort, setSpreadSort] = useState<"best" | "worst" | null>(null);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [signatureResult, setSignatureResult] = useState<string | null>(null);
  const [firstStockSymbol, setFirstStockSymbol] = useState("TSLA");
  const [firstStockAmount, setFirstStockAmount] = useState(10);
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  async function runStrategy(selectedRisk = risk) {
    const data = await getJson<Strategy>("/api/strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ risk: selectedRisk, maxTradeUsd, platforms: [platform], tabs: [tab] })
    });
    setStrategy(data);
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

  async function prepareFirstStock(symbol = firstStockSymbol) {
    const prompt = `Quote only: buy $${firstStockAmount} of ${symbol} tokenized stock`;
    const data = await getJson<AgentInterpretation>("/api/agent/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, walletAddress })
    });
    if (data.execution) setPreview(data.execution);
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
      const reason = error instanceof Error ? error.message : "Wallet declined or does not support eth_signTransaction.";
      setSignatureResult(
        `${label} raw signing is unavailable in this wallet: ${reason}\n\nNo broadcast was performed. The transaction payload was copied when clipboard access was available:\n${payload}`
      );
    }
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

  useEffect(() => {
    runStrategy(risk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, tab, maxTradeUsd]);

  const statusText = preview?.humanStatus ?? preview?.simulationSummary?.humanStatus ?? preview?.error ?? "Prepare an action to inspect execution.";

  // "Best" = most negative spreadBps (on-chain cheaper than reference = buy opportunity), matching
  // the same green/red opportunity semantics used for the spread color in the table.
  const sortedQuotes = useMemo(() => {
    if (!spreadSort) return quotes;
    const ascending = [...quotes].sort((a, b) => a.spreadBps - b.spreadBps);
    return spreadSort === "worst" ? ascending.reverse() : ascending;
  }, [quotes, spreadSort]);

  function toggleSpreadSort() {
    setSpreadSort((current) => (current === "best" ? "worst" : current === "worst" ? null : "best"));
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Monitor</p>
        <h1>On-chain / reference spread agent for BSC stocks</h1>
        <p className="lede">
          Quote, approval calldata, swap calldata and simulation are live. You sign only &mdash; CircuitStock never broadcasts. BSC mainnet, small demo
          amounts, not financial advice.
        </p>
      </div>

      <section className="quickFlow">
        <div className="quickFlowHead">
          <span className="eyebrow">First stock flow</span>
          <span className="hint">Pick a familiar stock, quote a small USDC route, simulate it, then sign only if your wallet supports it.</span>
        </div>
        <div className="quickFlowControls">
          <NumberStepper value={firstStockAmount} onChange={setFirstStockAmount} min={1} />
          <select value={firstStockSymbol} onChange={(event) => setFirstStockSymbol(event.target.value)}>
            <option value="TSLA">Tesla</option>
            <option value="NVDA">Nvidia</option>
            <option value="MSFT">Microsoft</option>
            <option value="SPY">S&amp;P 500 ETF</option>
          </select>
          <button onClick={() => prepareFirstStock()}>
            <BadgeDollarSign size={16} />
            Preview buy
          </button>
          <div className="quickStocks">
            {["TSLA", "NVDA", "MSFT", "SPY"].map((symbol) => (
              <button
                key={symbol}
                className="ghost"
                onClick={() => {
                  setFirstStockSymbol(symbol);
                  prepareFirstStock(symbol);
                }}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="filters">
        <SlidersHorizontal size={16} />
        <label>
          Platform
          <select value={platform} onChange={(event) => setPlatform(event.target.value as "bstock" | "ondo" | "all")}>
            <option value="all">All</option>
            <option value="bstock">bStocks</option>
            <option value="ondo">Ondo</option>
          </select>
        </label>
        {platform === "bstock" && (
          <label>
            Sector
            <select value={tab} onChange={(event) => setTab(Number(event.target.value))}>
              <option value={9}>Magnificent 7</option>
              <option value={4}>AI Chips</option>
              <option value={11}>ETF</option>
              <option value={12}>Buffett Portfolio</option>
            </select>
          </label>
        )}
        <label>
          Max trade
          <NumberStepper value={maxTradeUsd} onChange={setMaxTradeUsd} min={1} max={100} />
        </label>
      </section>

      <section className="workbench">
        <div className="panel wide">
          <div className="panelHead">
            <h2>Tokenized stock spreads</h2>
          </div>
          <div className="table">
            <div className="row head">
              <span>Asset</span>
              <span>Source</span>
              <span>On-chain</span>
              <span>Reference</span>
              <button
                type="button"
                className="sortableHead"
                onClick={toggleSpreadSort}
                title={
                  spreadSort === "best"
                    ? "Sorted best to worst opportunity - click to reverse"
                    : spreadSort === "worst"
                      ? "Sorted worst to best opportunity - click to reset"
                      : "Click to sort by spread, best opportunity first"
                }
              >
                Spread
                {spreadSort === "best" && <ChevronDown size={13} />}
                {spreadSort === "worst" && <ChevronUp size={13} />}
                {!spreadSort && <ChevronsUpDown size={13} />}
              </button>
            </div>
            {sortedQuotes.map((quote) => {
              const spreadClass = quote.spreadBps < 0 ? "positive" : quote.spreadBps > 0 ? "negative" : "";
              const spreadPct = Math.abs(quote.spreadBps) / 100;
              return (
                <div className="row" key={quote.symbol}>
                  <span>
                    <strong>{quote.symbol}</strong>
                    <small>
                      {quote.name}
                      {quote.shareRatio !== 1 ? ` · 1 token = ${quote.shareRatio} shares` : ""}
                    </small>
                  </span>
                  <span>{quote.tokenSource}</span>
                  <span>
                    {currency.format(quote.onchainPrice)}
                    {quote.shareRatio !== 1 && <small className="perShareNote">per share</small>}
                  </span>
                  <span>{currency.format(quote.referencePrice)}</span>
                  <span className={`spread ${spreadClass}`}>
                    <strong>{Math.abs(quote.spreadBps)} bps</strong>
                    <small>
                      {quote.spreadBps !== 0 &&
                        (quote.spreadBps < 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
                      {spreadPct.toFixed(2)}%
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panelHead">
            <h2>Rebalance preview</h2>
            <TrendingUp size={18} />
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
                    <strong>
                      {action.action.toUpperCase()} {action.symbol}
                    </strong>
                    <span>{currency.format(action.simulatedUsd)}</span>
                  </div>
                  <p>{action.reason}</p>
                  <small>
                    Score {action.score ?? "--"} &middot; {action.tokenAddress ? shortAddress(action.tokenAddress) : "live token"}
                  </small>
                  <button className="quoteButton" onClick={() => prepareExecution(action)} disabled={action.action === "watch"}>
                    Prepare execution
                  </button>
                </article>
              ))
            ) : (
              <p className="empty">No spread clears the current risk rules.</p>
            )}
          </div>

          <p className="note">
            <CheckCircle2 size={14} /> Simulation first. Approval and swap signatures only. No broadcast.
          </p>
        </div>
      </section>

      <section className="panel executionPreview">
        <div className="panelHead">
          <h2>Execution preview</h2>
        </div>
        <p className="statusLine">
          <strong>{statusText}</strong>
          <span>{preview?.nextRequiredAction ?? preview?.simulationSummary?.nextRequiredAction ?? "Connect a wallet for full calldata and simulation."}</span>
        </p>

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
              <CheckCircle2 size={14} />
              {label}
            </span>
          ))}
        </div>

        {preview?.selectedQuote && (
          <div className="statRow">
            <div>
              <span>Quote ID</span>
              <strong>{preview.selectedQuote.quoteId ?? "--"}</strong>
            </div>
            <div>
              <span>Vendor</span>
              <strong>{preview.selectedQuote.vendorName ?? "--"}</strong>
            </div>
            <div>
              <span>Price impact</span>
              <strong>{preview.selectedQuote.priceImpactPercent ?? "0"}%</strong>
            </div>
            <div>
              <span>Approve target</span>
              <strong>{shortAddress(preview.selectedQuote.approveTarget)}</strong>
            </div>
          </div>
        )}

        <div className="statRow">
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
            <FileSignature size={16} />
            Sign/copy approval
          </button>
          <button className="signButton" onClick={() => signTransaction("swap", preview?.swapTx ?? preview?.evmTx)} disabled={!preview?.swapTx && !preview?.evmTx}>
            <FileSignature size={16} />
            Sign/copy swap
          </button>
        </div>

        {signatureResult && <pre className="codeBlock">{signatureResult}</pre>}
        {preview?.apiWarnings?.length ? (
          <div className="warningList">
            {preview.apiWarnings.slice(0, 4).map((warning, index) => (
              <span key={`${warning.kind}-${index}`}>
                {warning.kind ?? "api_warning"}: {warning.message ?? warning.status ?? "review"}
              </span>
            ))}
          </div>
        ) : null}
        {preview?.error && <p className="empty">{preview.error}</p>}

        <div className="txVerifier">
          <span className="hint">Post-trade check &middot; paste a tx hash</span>
          <div className="txVerifierRow">
            <input value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x..." />
            <button onClick={verifyTxHash}>Verify</button>
          </div>
          {txStatus && <pre className="codeBlock">{txStatus}</pre>}
        </div>
      </section>
    </>
  );
}
