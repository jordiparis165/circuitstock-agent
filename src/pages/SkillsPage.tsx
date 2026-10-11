import { CheckCircle2, Puzzle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getJson, type SkillCheckResult, type SkillLogEntry } from "../lib/api";

export function SkillsPage() {
  const [calls, setCalls] = useState<SkillLogEntry[]>([]);
  const [checkResult, setCheckResult] = useState<SkillCheckResult | null>(null);
  const [checking, setChecking] = useState(false);

  async function load() {
    const data = await getJson<{ calls: SkillLogEntry[] }>("/api/skills/log");
    setCalls(data.calls);
  }

  useEffect(() => {
    load();
  }, []);

  async function runCheck() {
    setChecking(true);
    try {
      const data = await getJson<SkillCheckResult>("/api/skills/check");
      setCheckResult(data);
      load();
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Wallet Skills</p>
        <h1>Skills the agent actually called</h1>
        <p className="lede">Every call the agent makes to a wallet skill (Ondo market status, token listing, audit, dynamic token info) is logged here with latency and outcome - not a claim, a record.</p>
      </div>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Run a live check</h2>
            <p className="hint">Calls each skill once and reports pass/fail.</p>
          </div>
        </div>
        <button onClick={runCheck} disabled={checking}>
          <Puzzle size={16} />
          {checking ? "Checking..." : "Run check"}
        </button>
        {checkResult && (
          <div className="checklist" style={{ marginTop: 12 }}>
            {checkResult.checks.map((check, i) => (
              <span className={check.ok ? "done" : "failCheck"} key={i}>
                {check.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {check.skill}
                {check.error ? ` - ${check.error}` : ""}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Recent calls</h2>
        </div>
        {calls.length === 0 ? (
          <p className="empty">No skill calls logged yet.</p>
        ) : (
          <div className="rowList">
            {calls.map((call, i) => (
              <span key={i}>
                <strong>
                  {call.skill} - {call.endpoint}
                </strong>
                {call.status} - {call.latencyMs}ms - {new Date(call.at).toLocaleString()}
                {call.summary && <span className="hint">{call.summary}</span>}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
