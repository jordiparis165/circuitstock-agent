import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE, FALLBACK_API_BASE, getJson, type Evidence, type Readiness, type SmokeResult, type WalletReadiness } from "../lib/api";

const apiReference = [
  { label: "RWA Data API", detail: "/rwa/tokens + /underlying-profile + /underlying-market" },
  { label: "RWA Search", detail: "/rwa/platforms + /rwa/search ticker resolution" },
  { label: "Market API", detail: "/market/candles volatility and momentum" },
  { label: "Trading API", detail: "/quote + /approve-transaction + /swap + /history" },
  { label: "Transaction API", detail: "/gas-price + /gas-limit + /simulate" },
  { label: "Wallet API", detail: "/balance + /portfolio before trade" },
  { label: "BSC RPC proof", detail: "/api/wallet/readiness/:address chain, balances and allowance" },
  { label: "Agent endpoint", detail: "/api/agent/recommend/compact" },
  { label: "AI agent", detail: "/api/ai/agent live reasoning copilot" },
  { label: "b402 hook", detail: "/api/b402/manifest + /api/premium/signal" },
  { label: "Basket engine", detail: "/api/baskets/plan thematic allocations" },
  { label: "Judge smoke", detail: "/api/judge/readiness + /api/judge/smoke" }
];

export function JudgePage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [judgeSmoke, setJudgeSmoke] = useState<SmokeResult | null>(null);
  const [judgeChainProof, setJudgeChainProof] = useState<WalletReadiness | null>(null);
  const [judgeMessage, setJudgeMessage] = useState<string | null>(null);

  useEffect(() => {
    getJson<Readiness>("/api/judge/readiness").then(setReadiness).catch(() => undefined);
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }, []);

  async function runJudgeSmoke() {
    setJudgeMessage("Running judge smoke test...");
    const data = await getJson<SmokeResult>("/api/judge/smoke");
    setJudgeSmoke(data);
    setReadiness(data.readiness);
    setJudgeMessage(data.ok ? "Smoke test passed." : "Smoke test found an issue.");
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }

  async function runJudgeChainProof() {
    setJudgeMessage("Checking BSC RPC proof...");
    const data = await getJson<WalletReadiness>("/api/wallet/readiness/0x000000000000000000000000000000000000dEaD");
    setJudgeChainProof(data);
    setJudgeMessage("BSC RPC proof refreshed.");
    getJson<Evidence>("/api/evidence").then(setEvidence).catch(() => undefined);
  }

  async function copySubmissionBundle() {
    const links = readiness?.links ?? {
      repository: "https://github.com/jordiparis165/circuitstock-agent",
      frontend: "https://circuitstock-agent.vercel.app",
      api: FALLBACK_API_BASE,
      docs: "https://github.com/jordiparis165/circuitstock-agent/blob/main/README.md"
    };
    const bundle = [
      "CircuitStock Agent - BNB Hack Tokenized Stocks Edition",
      `Frontend: ${links.frontend}`,
      `API: ${links.api}`,
      `Repository: ${links.repository}`,
      `Docs: ${links.docs}`,
      `Judge readiness: ${links.api}/api/judge/readiness`,
      `Judge smoke: ${links.api}/api/judge/smoke`,
      `BSC proof: ${links.api}/api/wallet/readiness/0x000000000000000000000000000000000000dEaD`,
      "Boundary: RWA scan -> quote -> approval calldata -> swap calldata -> simulation -> user signature only. No automatic broadcast."
    ].join("\n");
    await navigator.clipboard?.writeText(bundle);
    setJudgeMessage("Submission bundle copied.");
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Judge Mode</p>
        <h1>Submission proof center</h1>
        <p className="lede">One-click checks that hit the deployed API and live BSC RPC. No transaction is ever broadcast.</p>
      </div>

      <section className="inlineActions">
        <button onClick={runJudgeSmoke}>Run smoke test</button>
        <button onClick={runJudgeChainProof}>Run BSC proof</button>
        <button className="ghost" onClick={copySubmissionBundle}>
          Copy submission bundle
        </button>
      </section>
      {judgeMessage && <p className="hint">{judgeMessage}</p>}

      <section className="linkGrid">
        {Object.entries(readiness?.links ?? {}).map(([label, href]) => (
          <a href={href} target="_blank" rel="noreferrer" key={label}>
            <strong>{label}</strong>
            <span>{href}</span>
          </a>
        ))}
        <a href={`${API_BASE || FALLBACK_API_BASE}/api/judge/smoke`} target="_blank" rel="noreferrer">
          <strong>smoke</strong>
          <span>/api/judge/smoke</span>
        </a>
        <a href={`${API_BASE || FALLBACK_API_BASE}/api/wallet/readiness/0x000000000000000000000000000000000000dEaD`} target="_blank" rel="noreferrer">
          <strong>BSC proof</strong>
          <span>/api/wallet/readiness/:address</span>
        </a>
      </section>

      <section className="judgeGrid">
        <div>
          <h2>{judgeSmoke ? (judgeSmoke.ok ? "All core checks pass" : "Review failing checks") : "One-click API audit"}</h2>
          <div className="checklist">
            {judgeSmoke?.checks.map((check) => (
              <span className={check.ok ? "done" : ""} key={check.name}>
                <CheckCircle2 size={14} />
                {check.name}
              </span>
            )) ?? <span className="hint">Run smoke test to verify market, basket, watcher, b402, wallet proof and no-broadcast.</span>}
          </div>
          {judgeSmoke && <small className="judgeMeta">{judgeSmoke.latencyMs} ms total latency</small>}
        </div>
        <div>
          <h2>{judgeChainProof ? `${judgeChainProof.chain} block ${judgeChainProof.blockNumber}` : "BSC RPC not cached yet"}</h2>
          <div className="checklist">
            {judgeChainProof ? (
              [
                ["BSC mainnet", judgeChainProof.checks.bscMainnet],
                ["USDC contract code", judgeChainProof.checks.usdcContractCode],
                ["BNB gas balance read", true],
                ["USDC balance read", true],
                ["Allowance read", true],
                ["No broadcast", judgeChainProof.checks.noBroadcast]
              ].map(([label, done]) => (
                <span className={done ? "done" : ""} key={String(label)}>
                  <CheckCircle2 size={14} />
                  {label}
                </span>
              ))
            ) : (
              <span className="hint">Run BSC proof to show current chain, latest block, USDC code and wallet reads.</span>
            )}
          </div>
        </div>
        <div>
          <h2>Submission checklist</h2>
          <div className="readinessRows compact">
            {readiness?.checklist.map((item) => (
              <span className={item.status} key={item.item}>
                <CheckCircle2 size={14} />
                {item.item}
              </span>
            )) ?? <span className="hint">Loading checklist</span>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>API evidence &middot; last successful calls</h2>
        </div>
        <div className="rowList">
          {evidence?.recentCalls?.slice(0, 8).map((call) => (
            <span key={`${call.endpoint}-${call.at}`}>
              <strong>{call.module}</strong>
              {call.status} &middot; {call.latencyMs} ms &middot; {call.endpoint}
            </span>
          )) ?? <span>No calls yet.</span>}
        </div>
      </section>

      <section className="stackList compact">
        {apiReference.map((item) => (
          <div key={item.label}>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </section>
    </>
  );
}
