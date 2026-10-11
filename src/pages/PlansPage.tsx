import { Play, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import { getJson, type Plan } from "../lib/api";

export function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("Weekly NVDA");
  const [amount, setAmount] = useState(50);
  const [frequency, setFrequency] = useState<Plan["frequency"]>("weekly");
  const [ticker, setTicker] = useState("NVDA");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await getJson<{ plans: Plan[] }>("/api/plans");
    setPlans(data.plans);
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    await getJson("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        amount_usd: String(amount),
        frequency,
        schedule: frequency === "weekly" ? "mon" : frequency === "monthly" ? "1" : "",
        basket: { mode: "tickers", tickers: [ticker], weights: "equal" },
        constraints: { issuer: "cheapest", max_premium_pct: "0.5", skip_if_market_closed: true },
        status: "draft"
      })
    });
    setMessage(`Draft plan "${name}" created.`);
    load();
  }

  async function setStatus(plan: Plan, status: Plan["status"]) {
    await getJson(`/api/plans/${plan.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    load();
  }

  async function run(id: string) {
    const data = await getJson<{ message: string }>(`/api/plans/${id}/run`, { method: "POST" });
    setMessage(data.message);
    load();
  }

  async function remove(id: string) {
    await getJson(`/api/plans/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Recurring plans</p>
        <h1>Dollar-cost average into a ticker or basket</h1>
        <p className="lede">Every run (simulated) uses the cheaper issuer, checks the premium, and skips cleanly if the market is closed. You can also describe a plan to the Agent in plain language.</p>
      </div>

      <section className="panel">
        <div className="panelHead">
          <h2>New plan</h2>
        </div>
        <div className="basketControls">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Ticker
            <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} />
          </label>
          <label>
            Amount (USD)
            <NumberStepper value={amount} onChange={setAmount} min={1} step={5} />
          </label>
          <label>
            Frequency
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as Plan["frequency"])}>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
              <option value="monthly">monthly</option>
              <option value="one_shot">one-shot</option>
            </select>
          </label>
          <button onClick={create}>Create draft</button>
        </div>
        {message && <p className="hint">{message}</p>}
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Your plans</h2>
        </div>
        {plans.length === 0 ? (
          <p className="empty">No plans yet.</p>
        ) : (
          <div className="rowList">
            {plans.map((plan) => (
              <span key={plan.id}>
                <strong>
                  {plan.name} - ${plan.amount_usd} {plan.frequency}
                </strong>
                status: {plan.status} - basket: {plan.basket.tickers?.join(", ") ?? plan.basket.sector ?? plan.basket.theme}
                {plan.last_run_at && ` - last run ${new Date(plan.last_run_at).toLocaleString()}`}
                <span className="inlineActions" style={{ marginTop: 6 }}>
                  {plan.status !== "active" && (
                    <button className="ghost" onClick={() => setStatus(plan, "active")}>
                      Activate
                    </button>
                  )}
                  {plan.status === "active" && (
                    <button className="ghost" onClick={() => setStatus(plan, "paused")}>
                      Pause
                    </button>
                  )}
                  <button className="ghost" onClick={() => run(plan.id)}>
                    <Play size={14} />
                    Run now (simulated)
                  </button>
                  <button className="ghost" onClick={() => remove(plan.id)}>
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
