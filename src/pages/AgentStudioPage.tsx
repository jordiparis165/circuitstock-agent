import { useEffect, useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import { currency, getJson, type AgentInterpretation, type AiAgentResult, type WatcherPolicy, type WatcherStatus } from "../lib/api";
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
  const [policy, setPolicy] = useState<WatcherPolicy | null>(null);
  const [allowedSymbolsText, setAllowedSymbolsText] = useState("");
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

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

  async function loadPolicy() {
    const data = await getJson<{ policy: WatcherPolicy }>("/api/watcher/policy");
    setPolicy(data.policy);
    setAllowedSymbolsText(data.policy.allowedSymbols.join(", "));
  }

  function updatePolicyField<K extends keyof WatcherPolicy>(field: K, value: WatcherPolicy[K]) {
    setPolicy((current) => (current ? { ...current, [field]: value } : current));
  }

  async function savePolicy() {
    if (!policy) return;
    setSavingPolicy(true);
    setPolicyMessage(null);
    try {
      const data = await getJson<{ policy: WatcherPolicy }>("/api/watcher/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...policy,
          allowedSymbols: allowedSymbolsText
            .split(",")
            .map((symbol) => symbol.trim())
            .filter(Boolean)
        })
      });
      setPolicy(data.policy);
      setAllowedSymbolsText(data.policy.allowedSymbols.join(", "));
      setPolicyMessage("Settings saved - applied on the next watcher tick.");
    } catch {
      setPolicyMessage("Could not save settings, try again.");
    } finally {
      setSavingPolicy(false);
    }
  }

  useEffect(() => {
    loadPolicy();
  }, []);

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
            <h2>Trading/arbitrage settings</h2>
            <p className="hint">Tune the watcher to your own risk appetite and budget. Changes apply on the next tick, no restart needed.</p>
          </div>
        </div>
        {!policy ? (
          <p className="hint">Loading current settings...</p>
        ) : (
          <>
            <div className="settingsGrid">
              <label>
                Min spread
                <NumberStepper value={policy.minSpreadBps} onChange={(value) => updatePolicyField("minSpreadBps", value)} min={0} step={5} />
                <small>basis points (100 bps = 1%)</small>
              </label>
              <label>
                Min score
                <NumberStepper value={policy.minScore} onChange={(value) => updatePolicyField("minScore", value)} min={0} step={5} />
              </label>
              <label>
                Min liquidity
                <NumberStepper
                  value={policy.minLiquidityUsd}
                  onChange={(value) => updatePolicyField("minLiquidityUsd", value)}
                  min={0}
                  step={10000}
                />
                <small>USD 24h volume</small>
              </label>
              <label>
                Max per trade
                <NumberStepper value={policy.maxTradeUsd} onChange={(value) => updatePolicyField("maxTradeUsd", value)} min={1} />
                <small>USD</small>
              </label>
              <label>
                Max per day
                <NumberStepper value={policy.maxDailyUsd} onChange={(value) => updatePolicyField("maxDailyUsd", value)} min={1} />
                <small>USD, resets daily</small>
              </label>
              <label>
                Max slippage
                <NumberStepper value={policy.maxSlippageBps} onChange={(value) => updatePolicyField("maxSlippageBps", value)} min={1} step={5} />
                <small>basis points</small>
              </label>
              <label>
                Cooldown
                <NumberStepper value={policy.cooldownSec} onChange={(value) => updatePolicyField("cooldownSec", value)} min={0} step={300} />
                <small>seconds between trades on the same token</small>
              </label>
            </div>
            <label className="symbolsField">
              Allowed symbols (comma-separated, empty = nothing is allowed)
              <input value={allowedSymbolsText} onChange={(event) => setAllowedSymbolsText(event.target.value)} placeholder="TSLAB, NVDAB, SPYON" />
            </label>
            <div className="inlineActions">
              <button onClick={savePolicy} disabled={savingPolicy}>
                {savingPolicy ? "Saving..." : "Save settings"}
              </button>
            </div>
            {policyMessage && <p className="hint">{policyMessage}</p>}
          </>
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
