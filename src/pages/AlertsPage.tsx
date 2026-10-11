import { Bell, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import { getJson, type AlertRule } from "../lib/api";

const alertTypes: AlertRule["type"][] = ["price", "premium", "issuer_gap", "market_state", "news", "audit_risk", "rotation_gain", "plan_event"];

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [ticker, setTicker] = useState("NVDA");
  const [type, setType] = useState<AlertRule["type"]>("premium");
  const [op, setOp] = useState<"<" | ">">("<");
  const [value, setValue] = useState(0.3);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await getJson<{ alerts: AlertRule[] }>("/api/alerts");
    setAlerts(data.alerts);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    await getJson("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, type, condition: { op, value: String(value) }, channels: ["in_app"], enabled: true })
    });
    setMessage(`Alert created for ${ticker}.`);
    load();
  }

  async function toggle(alert: AlertRule) {
    await getJson(`/api/alerts/${alert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !alert.enabled })
    });
    load();
  }

  async function remove(id: string) {
    await getJson(`/api/alerts/${id}`, { method: "DELETE" });
    load();
  }

  async function test(id: string) {
    const data = await getJson<{ trigger: { message: string } }>(`/api/alerts/${id}/test`, { method: "POST" });
    setMessage(`Test trigger: ${data.trigger.message}`);
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Alerts</p>
        <h1>Get notified instead of watching the screen</h1>
        <p className="lede">Checked on the server on a fixed interval; fires once on crossing, then respects a cooldown. You can also create one from the Agent chat in plain language.</p>
      </div>

      <section className="panel">
        <div className="panelHead">
          <h2>New alert</h2>
        </div>
        <div className="basketControls">
          <label>
            Ticker
            <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} />
          </label>
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value as AlertRule["type"])}>
              {alertTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={op} onChange={(event) => setOp(event.target.value as "<" | ">")}>
              <option value="<">below</option>
              <option value=">">above</option>
            </select>
          </label>
          <label>
            Value (%)
            <NumberStepper value={value} onChange={setValue} min={0} step={0.1} />
          </label>
          <button onClick={create}>
            <Bell size={16} />
            Create alert
          </button>
        </div>
        {message && <p className="hint">{message}</p>}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Your alerts</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="empty">No alerts yet.</p>
        ) : (
          <div className="rowList">
            {alerts.map((alert) => (
              <span key={alert.id}>
                <strong>
                  {alert.ticker} - {alert.type} {alert.condition.op} {alert.condition.value}
                </strong>
                {alert.enabled ? "enabled" : "disabled"} - created {new Date(alert.created_at).toLocaleDateString()}
                {alert.last_triggered_at && ` - last triggered ${new Date(alert.last_triggered_at).toLocaleString()}`}
                <span className="inlineActions" style={{ marginTop: 6 }}>
                  <button className="ghost" onClick={() => toggle(alert)}>
                    {alert.enabled ? "Disable" : "Enable"}
                  </button>
                  <button className="ghost" onClick={() => test(alert.id)}>
                    Test trigger
                  </button>
                  <button className="ghost" onClick={() => remove(alert.id)}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
