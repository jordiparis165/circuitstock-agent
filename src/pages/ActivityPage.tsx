import { useEffect, useState } from "react";
import { getJson, type AgentDecision } from "../lib/api";

export function ActivityPage() {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ mode: string; decisions: AgentDecision[] }>("/api/agent/part-b/ledger").then((data) => {
      setMode(data.mode);
      setDecisions(data.decisions);
    });
  }, []);

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Activity</p>
        <h1>Every decision the agent cycle has made</h1>
        <p className="lede">A full journal, including what it chose not to do and why. {mode && `Mode: ${mode}.`}</p>
      </div>

      <section className="panel">
        {decisions.length === 0 ? (
          <p className="empty">No decisions logged yet.</p>
        ) : (
          <div className="rowList">
            {decisions.map((decision) => (
              <span key={decision.requestId}>
                <strong>
                  {decision.action} - {decision.opportunity?.ticker ?? "-"} - {decision.outcome}
                </strong>
                {new Date(decision.at).toLocaleString()}
                <span className="hint">{decision.rationale}</span>
                {decision.violations.length > 0 && (
                  <div className="checklist" style={{ marginTop: 6 }}>
                    {decision.violations.map((v, i) => (
                      <span className="failCheck" key={i}>
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
