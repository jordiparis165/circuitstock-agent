import { Power } from "lucide-react";
import { useEffect, useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import { getJson, type AgentPreset, type PivotSettings, type SettingsChange } from "../lib/api";

const presets: AgentPreset[] = ["prudent", "balanced", "dynamic"];

export function SettingsPage() {
  const [settings, setSettings] = useState<PivotSettings | null>(null);
  const [changes, setChanges] = useState<SettingsChange[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await getJson<{ settings: PivotSettings; changes: SettingsChange[] }>("/api/settings");
    setSettings(data.settings);
    setChanges(data.changes);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(partial: Partial<PivotSettings>) {
    const data = await getJson<{ settings: PivotSettings; changes: SettingsChange[] }>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial)
    });
    setSettings(data.settings);
    setChanges(data.changes);
    setMessage("Saved.");
  }

  async function applyPreset(preset: AgentPreset) {
    await save({ preset });
  }

  async function reset() {
    const data = await getJson<{ settings: PivotSettings; changes: SettingsChange[] }>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true, preset: settings?.preset ?? "balanced" })
    });
    setSettings(data.settings);
    setChanges(data.changes);
    setMessage("Reset to preset defaults.");
  }

  async function toggleKill() {
    const data = await getJson<{ settings: PivotSettings }>("/api/settings/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !settings?.agent_enabled })
    });
    setSettings(data.settings);
    load();
  }

  if (!settings) return <p className="hint">Loading...</p>;

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Settings</p>
        <h1>Your rules, not the agent's</h1>
        <p className="lede">Every agent decision reads these values. The agent can propose a change (e.g. "switch to prudent") but never applies one without you confirming it here.</p>
      </div>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h2>Agent status</h2>
          </div>
        </div>
        <div className={`statusBox ${settings.agent_enabled ? "" : "killedBox"}`}>
          <strong>{settings.agent_enabled ? "Agent is active" : "Agent is disabled"}</strong>
          <span>Disabling stops all plans, alerts and suggestions immediately. The dashboard stays readable.</span>
        </div>
        <button className={settings.agent_enabled ? "killButton" : ""} onClick={toggleKill}>
          <Power size={16} />
          {settings.agent_enabled ? "Disable agent (kill switch)" : "Re-enable agent"}
        </button>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Presets</h2>
        </div>
        <div className="segmented" aria-label="Preset">
          {presets.map((preset) => (
            <button key={preset} className={settings.preset === preset ? "selected" : ""} onClick={() => applyPreset(preset)}>
              {preset}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={reset} style={{ marginTop: 10 }}>
          Reset to preset defaults
        </button>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Order limits</h2>
        </div>
        <div className="settingsGrid">
          <label>
            Min order
            <NumberStepper value={settings.min_order_usd} onChange={(v) => save({ min_order_usd: v })} min={1} step={5} />
            <small>USD</small>
          </label>
          <label>
            Max order
            <NumberStepper value={settings.max_order_usd} onChange={(v) => save({ max_order_usd: v })} min={1} step={25} />
            <small>USD</small>
          </label>
          <label>
            Daily cap
            <NumberStepper value={settings.daily_cap_usd} onChange={(v) => save({ daily_cap_usd: v })} min={1} step={50} />
            <small>USD</small>
          </label>
          <label>
            Max route cost
            <NumberStepper value={settings.max_route_cost_pct} onChange={(v) => save({ max_route_cost_pct: v })} min={0.1} step={0.1} />
            <small>% round-trip, measured not estimated</small>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Premium thresholds</h2>
        </div>
        <div className="settingsGrid">
          <label>
            Noise band
            <NumberStepper value={settings.premium_noise_pct} onChange={(v) => save({ premium_noise_pct: v })} min={0} step={0.05} />
            <small>% - below this, "fair price"</small>
          </label>
          <label>
            Warn threshold
            <NumberStepper value={settings.premium_warn_pct} onChange={(v) => save({ premium_warn_pct: v })} min={0} step={0.05} />
            <small>% - above this, "premium too high"</small>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Rotation between issuers</h2>
        </div>
        <div className="settingsGrid">
          <label>
            Gain multiple (k)
            <NumberStepper value={settings.rotation_k} onChange={(v) => save({ rotation_k: v })} min={1} step={1} />
            <small>gain must be &ge; k &times; measured route cost</small>
          </label>
          <label>
            Min gain
            <NumberStepper value={settings.rotation_min_gain_usd} onChange={(v) => save({ rotation_min_gain_usd: v })} min={0} step={0.5} />
            <small>USD</small>
          </label>
          <label>
            Cooldown
            <NumberStepper value={settings.rotation_cooldown_h} onChange={(v) => save({ rotation_cooldown_h: v })} min={1} step={1} />
            <small>hours per ticker</small>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Safety</h2>
        </div>
        <div className="stackList compact">
          <div>
            <strong>Require token audit</strong>
            <span>
              <input type="checkbox" checked={settings.require_audit} onChange={(event) => save({ require_audit: event.target.checked })} /> blocks
              trading on tokens the audit skill flags
            </span>
          </div>
          <div>
            <strong>Block level</strong>
            <span>
              <select value={settings.audit_block_level} onChange={(event) => save({ audit_block_level: event.target.value as "MEDIUM" | "HIGH" })}>
                <option value="MEDIUM">MEDIUM and above</option>
                <option value="HIGH">HIGH only</option>
              </select>
            </span>
          </div>
          <div>
            <strong>Use news</strong>
            <span>
              <input type="checkbox" checked={settings.use_news} onChange={(event) => save({ use_news: event.target.checked })} /> feed Opportunities with
              news when a source is available
            </span>
          </div>
        </div>
      </section>

      {message && <p className="hint">{message}</p>}

      <section className="panel">
        <div className="panelHead">
          <h2>Recent changes</h2>
        </div>
        {changes.length === 0 ? (
          <p className="empty">No changes yet.</p>
        ) : (
          <div className="rowList">
            {changes.map((change, i) => (
              <span key={i}>
                <strong>
                  {change.key}: {JSON.stringify(change.oldValue)} &rarr; {JSON.stringify(change.newValue)}
                </strong>
                {change.actor} - {new Date(change.at).toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
