import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getJson, type AgentDecision, type Portfolio } from "../lib/api";

export function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [suggestions, setSuggestions] = useState<AgentDecision[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    getJson<Portfolio>("/api/portfolio").then(setPortfolio).catch(() => undefined);
  }, []);

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      const data = await getJson<{ suggestions: AgentDecision[] }>("/api/rebalance/suggestions");
      setSuggestions(data.suggestions);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function confirm(decision: AgentDecision, confirmed: boolean) {
    await getJson("/api/rebalance/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: decision.requestId })
    });
    setMessage(confirmed ? `Confirmed (simulated): ${decision.opportunity?.ticker ?? decision.action}.` : "Ignored.");
    setSuggestions((current) => current.filter((item) => item.requestId !== decision.requestId));
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Simulated portfolio</p>
        <h1>Holdings and rotation suggestions</h1>
        <p className="lede">Shares held per issuer, and rotation ideas the agent would propose - nothing executes until you confirm, and even then it's simulated only.</p>
      </div>

      <section className="panel">
        <div className="panelHead">
          <h2>Holdings</h2>
        </div>
        {!portfolio ? (
          <p className="hint">Loading...</p>
        ) : portfolio.holdings.length === 0 ? (
          <p className="empty">{portfolio.message}</p>
        ) : (
          <pre className="codeBlock">{JSON.stringify(portfolio.holdings, null, 2)}</pre>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Rotation suggestions</h2>
            <p className="hint">Sell the richer issuer, buy the cheaper one for the same ticker - only suggested if the expected gain clears the measured route cost by a margin (see Settings).</p>
          </div>
        </div>
        <button onClick={loadSuggestions} disabled={loadingSuggestions}>
          {loadingSuggestions ? "Checking..." : "Check for a suggestion"}
        </button>
        {message && <p className="hint">{message}</p>}

        {suggestions.map((decision) => (
          <div className="panel" key={decision.requestId} style={{ marginTop: 14 }}>
            <div className="panelHead">
              <div>
                <p className="eyebrow">{decision.outcome}</p>
                <h2>{decision.opportunity?.ticker ?? decision.action}</h2>
              </div>
            </div>
            <p className="hint">{decision.rationale}</p>
            {decision.opportunity && (
              <div className="statRow">
                <div>
                  <span>Gross spread</span>
                  <strong>{decision.opportunity.grossSpreadPct}%</strong>
                </div>
                <div>
                  <span>Net edge</span>
                  <strong>{decision.opportunity.netEdgePct}%</strong>
                </div>
                <div>
                  <span>Size</span>
                  <strong>${decision.opportunity.sizeUsd}</strong>
                </div>
              </div>
            )}
            {decision.violations.length > 0 && (
              <div className="checklist">
                {decision.violations.map((violation, i) => (
                  <span className="failCheck" key={i}>
                    <XCircle size={14} />
                    {violation}
                  </span>
                ))}
              </div>
            )}
            <div className="inlineActions" style={{ marginTop: 10 }}>
              <button onClick={() => confirm(decision, true)} disabled={decision.outcome !== "paper-filled"}>
                <CheckCircle2 size={16} />
                Confirm (simulated)
              </button>
              <button className="ghost" onClick={() => confirm(decision, false)}>
                Ignore
              </button>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
