import { CheckCircle2, HelpCircle, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getJson, type AgentChatResponse } from "../lib/api";
import { useShell } from "../lib/shell";

const examplePrompts = [
  "Buy 50$ of NVDA",
  "Premium of AAPL?",
  "Rotate my AAPL position",
  "Alert me when the premium drops below 0.3%",
  "Set up a weekly 50$ plan on NVDA",
  "Switch to the prudent preset"
];

export function AgentPage() {
  const { settings, refresh } = useShell();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Array<{ message: string; response: AgentChatResponse }>>([]);
  const [sending, setSending] = useState(false);

  async function send(text = message) {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const response = await getJson<AgentChatResponse>("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      setHistory((current) => [{ message: text, response }, ...current]);
      setMessage("");
      refresh();
    } finally {
      setSending(false);
    }
  }

  // A ticker clicked on the Dashboard arrives as navigation state and is sent straight away.
  useEffect(() => {
    const prompt = (location.state as { prompt?: string } | null)?.prompt;
    if (prompt) {
      send(prompt);
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Agent</p>
        <h1>Talk to the agent in plain language</h1>
        <p className="lede">
          It calls tools, never trades on its own, and always shows the checks behind its answer. Every action is <strong>simulated</strong> - nothing
          is ever signed or broadcast.
        </p>
        {settings && !settings.agent_enabled && (
          <p className="warnLine">The agent is disabled in Settings - re-enable it to get real answers.</p>
        )}
      </div>

      <section className="composer">
        <div className="inlineForm">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && send()}
            placeholder="Ask anything, e.g. buy 50$ of NVDA"
            autoFocus
          />
          <button onClick={() => send()} disabled={sending}>
            <Send size={16} />
            {sending ? "Thinking..." : "Send"}
          </button>
        </div>
        <div className="chipRow">
          {examplePrompts.map((prompt) => (
            <button key={prompt} type="button" className="chip" onClick={() => send(prompt)} disabled={sending}>
              {prompt}
            </button>
          ))}
        </div>
      </section>

      {history.map((entry, index) => (
        <article className="panel answer" key={index}>
          <p className="askedLine">{entry.message}</p>
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
            <span>Tools: {entry.response.tools.join(", ")}</span>
          </footer>
        </article>
      ))}
    </>
  );
}
