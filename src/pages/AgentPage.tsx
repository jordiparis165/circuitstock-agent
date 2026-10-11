import { CheckCircle2, HelpCircle, Send, XCircle, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError, getJson, type AgentChatResponse, type AgentStatus, type ChatTool } from "../lib/api";
import { useShell } from "../lib/shell";

// Quick actions call the tools directly: same checks, no model, no cost. They are what keeps the
// product usable when the LLM key is missing or the daily budget is spent.
const quickActions: Array<{ label: string; tool: ChatTool; body: Record<string, string> }> = [
  { label: "Cheapest issuer for $50 of AAPL", tool: "propose_buy", body: { ticker: "AAPL", amount_usd: "50" } },
  { label: "Premium of NVDA", tool: "get_premium", body: { ticker: "NVDA" } },
  { label: "Premium of TSLA", tool: "get_premium", body: { ticker: "TSLA" } },
  { label: "Suggest a rotation", tool: "propose_rotation", body: {} },
  { label: "Propose the prudent preset", tool: "propose_setting_change", body: { preset: "prudent" } }
];

const examplePrompts = [
  "Is AAPL expensive right now?",
  "Buy 200 dollars of NVDA",
  "Alert me when the NVDA premium drops below 0.3%",
  "Set up a weekly 50$ plan on TSLA"
];

type Entry = { asked: string; response: AgentChatResponse };

export function AgentPage() {
  const { settings } = useShell();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Entry[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    getJson<AgentStatus>("/api/agent/status").then(setStatus).catch(() => undefined);
  }, []);

  async function post(asked: string, url: string, body: Record<string, unknown>) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await getJson<AgentChatResponse>(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setHistory((current) => [{ asked, response }, ...current]);
      setMessage("");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The agent could not be reached.");
    } finally {
      setSending(false);
    }
  }

  const sendMessage = (text = message) => (text.trim() ? post(text, "/api/agent/chat", { message: text }) : undefined);
  const runAction = (action: (typeof quickActions)[number]) =>
    post(action.label, "/api/agent/action", { tool: action.tool, ...action.body });

  // A ticker clicked on the Dashboard arrives as navigation state; run it as a quick action so it
  // works even without a model.
  useEffect(() => {
    const ticker = (location.state as { ticker?: string } | null)?.ticker;
    if (ticker) {
      post(`Premium of ${ticker}`, "/api/agent/action", { tool: "get_premium", ticker });
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const llmDown = status ? !status.llm.configured : false;

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Agent</p>
        <h1>Ask about any ticker, in your own words</h1>
        <p className="lede">
          The model only decides <strong>which tool to run and with what arguments</strong>. Every price, check and threshold below is computed by
          code, never written by the model - so it cannot invent a number. Everything is <strong>simulated</strong>: nothing is signed or broadcast.
        </p>
        {settings && !settings.agent_enabled && <p className="warnLine">The agent is disabled in Settings - re-enable it to get answers.</p>}
        {llmDown && (
          <p className="warnLine">
            Free-text chat is unavailable ({status?.llm.reason}). The quick actions below still run the same tools, with the same checks.
          </p>
        )}
      </div>

      <section className="composer">
        <div className="inlineForm">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && sendMessage()}
            placeholder={llmDown ? "Free-text chat needs a model - use a quick action below" : "e.g. is AAPL expensive right now?"}
            disabled={llmDown}
            autoFocus
          />
          <button onClick={() => sendMessage()} disabled={sending || llmDown}>
            <Send size={16} />
            {sending ? "Thinking..." : "Send"}
          </button>
        </div>

        {!llmDown && (
          <div className="chipRow">
            {examplePrompts.map((prompt) => (
              <button key={prompt} type="button" className="chip" onClick={() => sendMessage(prompt)} disabled={sending}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div className="quickActions">
          <p className="quickActionsLabel">
            <Zap size={13} />
            Quick actions - no model, no cost
          </p>
          <div className="chipRow">
            {quickActions.map((action) => (
              <button key={action.label} type="button" className="chip solid" onClick={() => runAction(action)} disabled={sending}>
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="warnLine">{error}</p>}
      </section>

      {history.map((entry, index) => (
        <article className="panel answer" key={index}>
          <p className="askedLine">{entry.asked}</p>
          <p className="statusLine">
            <strong>{entry.response.reply}</strong>
          </p>

          <div className="answerHead">
            <h2>{entry.response.card.title}</h2>
            <span className="simTag">{entry.response.card.simulated ? "Simulated" : "Live"}</span>
          </div>
          <p className="hint">{entry.response.card.summary}</p>

          {entry.response.card.checks.length > 0 && (
            <div className="checklist">
              {entry.response.card.checks.map((check) => (
                <span className={check.status === "pass" ? "done" : check.status === "fail" ? "failCheck" : ""} key={check.id}>
                  {check.status === "pass" ? <CheckCircle2 size={14} /> : check.status === "fail" ? <XCircle size={14} /> : <HelpCircle size={14} />}
                  {check.label}
                  {check.value ? ` - ${check.value}` : ""}
                  {check.threshold ? ` (vs ${check.threshold})` : ""}
                  {check.source ? <em className="checkSource">{check.source}</em> : null}
                </span>
              ))}
            </div>
          )}

          {entry.response.card.would_change_if.length > 0 && (
            <details>
              <summary>What would change this answer?</summary>
              <ul className="reasonList">
                {entry.response.card.would_change_if.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </details>
          )}

          <footer className="answerFoot">
            <span>{entry.response.tools.length > 0 ? `Tools: ${entry.response.tools.join(", ")}` : "No tool ran"}</span>
            <span>{provenance(entry.response)}</span>
          </footer>
        </article>
      ))}
    </>
  );
}

// Says exactly how much the model was involved, so nobody can mistake a deterministic result for
// a generated one, or the reverse.
function provenance(response: AgentChatResponse): string {
  if (!response.llm?.available) return "Computed by code - no model involved";
  const routed = response.llm.routedTo ? `routed to ${response.llm.routedTo}` : "routed";
  return response.llm.explained
    ? `${response.llm.model}: ${routed}, wording only - figures computed by code`
    : `${response.llm.model}: ${routed} - figures computed by code`;
}
