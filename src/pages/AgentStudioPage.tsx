import { useState } from "react";
import { currency, getJson, type AgentInterpretation, type AiAgentResult, type WatcherStatus } from "../lib/api";
import { useShell } from "../lib/shell";

export function AgentStudioPage() {
  const { walletAddress, risk, platform, tab, maxTradeUsd } = useShell();

  const [aiPrompt, setAiPrompt] = useState("Given the live scanner and risk rules, what should we do next?");
  const [aiAgent, setAiAgent] = useState<AiAgentResult | null>(null);
  const [agentPrompt, setAgentPrompt] = useState("Quote only: buy $10 of TSLA tokenized stock");
  const [agentReply, setAgentReply] = useState<AgentInterpretation | null>(null);
  const [watcher, setWatcher] = useState<WatcherStatus | null>(null);
  const [watcherMessage, setWatcherMessage] = useState<string | null>(null);
  const [watcherLoaded, setWatcherLoaded] = useState(false);

  async function runAiCopilot() {
    const data = await getJson<AiAgentResult>("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, risk, maxTradeUsd, platforms: [platform], tabs: [tab] })
    });
    setAiAgent(data);
  }

  async function interpretAgentPrompt() {
    const data = await getJson<AgentInterpretation>("/api/agent/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: agentPrompt, walletAddress })
    });
    setAgentReply(data);
  }

  async function loadWatcher() {
    const data = await getJson<WatcherStatus>("/api/watcher/status");
    setWatcher(data);
    setWatcherLoaded(true);
  }

  async function watcherAction(action: "tick" | "kill" | "resume") {
    const data = await getJson<{ decision?: WatcherStatus["decisions"][number]; status?: WatcherStatus } | WatcherStatus>(
      action === "tick" ? "/api/watcher/tick" : `/api/watcher/${action}`,
      { method: "POST" }
    );
    const nextStatus = "status" in data && data.status ? data.status : (data as WatcherStatus);
    setWatcher(nextStatus);
    setWatcherLoaded(true);
    if ("decision" in data && data.decision) {
      setWatcherMessage(`${data.decision.outcome}: ${data.decision.reasons.join("; ")}`);
    } else {
      setWatcherMessage(action === "kill" ? "Kill switch enabled." : "Watcher resumed.");
    }
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Agent Studio</p>
        <h1>Runtime integration shape</h1>
        <p className="lede">How an external agent or LLM copilot plugs into CircuitStock, plus the autonomous dry-run watcher.</p>
      </div>

      <section className="stackList">
        <div>
          <strong>Compact payload</strong>
          <span>Recommendation, reason, confidence, required user action and transaction preview.</span>
        </div>
        <div>
          <strong>Monitoring loop</strong>
          <span>
            Schedule <code>/api/agent/recommend</code> and escalate only when spread, liquidity and risk rules pass.
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Live reasoning copilot</h2>
            <p className="hint">Uses the live scanner, risk rules and readiness context. If no LLM key is configured, a deterministic fallback stays active.</p>
          </div>
        </div>
        <div className="inlineForm">
          <input value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
          <button onClick={runAiCopilot}>Run AI agent</button>
        </div>
        {aiAgent && (
          <p className="statusLine">
            <strong>{aiAgent.mode === "llm" ? `LLM ${aiAgent.model}` : "Deterministic fallback"}</strong>
            <span>{aiAgent.answer}</span>
            {aiAgent.error && <small>{aiAgent.error}</small>}
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Prompt interpreter</h2>
        </div>
        <div className="inlineForm">
          <input value={agentPrompt} onChange={(event) => setAgentPrompt(event.target.value)} />
          <button onClick={interpretAgentPrompt}>Run prompt</button>
        </div>
        {agentReply && (
          <p className="statusLine">
            <strong>{agentReply.spokenSummary}</strong>
            <span>
              Intent: {agentReply.intent?.side} {agentReply.intent?.symbol} &middot; ${agentReply.intent?.amountUsd} &middot; no broadcast
            </span>
          </p>
        )}
      </section>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Autonomous dry-run watcher</h2>
            <p className="hint">
              Policy-gated monitor with whitelist, spread threshold, liquidity floor, daily budget, cooldown and kill switch. It refuses live execution
              until an executor is wired.
            </p>
          </div>
        </div>
        {!watcherLoaded ? (
          <button onClick={loadWatcher}>Load watcher status</button>
        ) : (
          <>
            <div className="statRow">
              <div>
                <span>Status</span>
                <strong>{watcher?.enabled ? (watcher.running ? "running" : "enabled") : "disabled"}</strong>
              </div>
              <div>
                <span>Mode</span>
                <strong>{watcher?.policy.mode ?? "dry-run"}</strong>
              </div>
              <div>
                <span>Kill switch</span>
                <strong>{watcher?.killed ? "on" : "off"}</strong>
              </div>
              <div>
                <span>Daily spent</span>
                <strong>{currency.format(watcher?.spentTodayUsd ?? 0)}</strong>
              </div>
              <div>
                <span>Min spread</span>
                <strong>{watcher?.policy.minSpreadBps ?? "--"} bps</strong>
              </div>
              <div>
                <span>Max trade</span>
                <strong>{currency.format(watcher?.policy.maxTradeUsd ?? 0)}</strong>
              </div>
            </div>
            <div className="inlineActions">
              <button onClick={() => watcherAction("tick")}>Run dry-run tick</button>
              <button className="ghost" onClick={() => watcherAction("kill")}>
                Kill
              </button>
              <button className="ghost" onClick={() => watcherAction("resume")}>
                Resume
              </button>
            </div>
            <div className="rowList">
              {watcherMessage && (
                <span>
                  <strong>Latest action</strong>
                  {watcherMessage}
                </span>
              )}
              {watcher?.decisions?.slice(0, 4).map((decision) => (
                <span key={`${decision.at}-${decision.symbol ?? "none"}`}>
                  <strong>
                    {decision.outcome} {decision.symbol ?? ""}
                  </strong>
                  {decision.reasons.join("; ")}
                </span>
              ))}
            </div>
          </>
        )}
      </section>
    </>
  );
}
