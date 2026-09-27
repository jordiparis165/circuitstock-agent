import { currency } from "../lib/api";
import { useShell } from "../lib/shell";

const sectorLabels: Record<number, string> = {
  9: "Magnificent 7",
  4: "AI Chips",
  11: "ETF",
  12: "Buffett Portfolio"
};

export function RiskRulesPage() {
  const { risk, platform, tab, maxTradeUsd } = useShell();

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Risk Rules</p>
        <h1>Execution guardrails</h1>
        <p className="lede">The rules that gate every recommendation and execution preview, wherever they run in the app.</p>
      </div>

      <section className="stackList">
        <div>
          <strong>Small size</strong>
          <span>Default trade size is $10 and capped by the max trade setting.</span>
        </div>
        <div>
          <strong>Pre-flight checks</strong>
          <span>Wallet balances, official approval payload, gas checks and simulation run before signing.</span>
        </div>
        <div>
          <strong>No broadcast</strong>
          <span>Signing is optional. If raw signing is unsupported, CircuitStock displays and copies the payload instead.</span>
        </div>
      </section>

      <section className="panel">
        <div className="panelHead">
          <h2>Currently applied on Monitor &amp; Baskets</h2>
        </div>
        <div className="statRow">
          <div>
            <span>Risk profile</span>
            <strong>{risk}</strong>
          </div>
          <div>
            <span>Platform</span>
            <strong>{platform === "bstock" ? "bStocks" : platform === "ondo" ? "Ondo" : platform === "xstock" ? "xStocks" : "All"}</strong>
          </div>
          <div>
            <span>Sector</span>
            <strong>{platform === "bstock" ? sectorLabels[tab] ?? tab : "All (bStocks only)"}</strong>
          </div>
          <div>
            <span>Max trade</span>
            <strong>{currency.format(maxTradeUsd)}</strong>
          </div>
        </div>
        <p className="hint">Change these from the filters on the Monitor page &mdash; they apply everywhere a recommendation is generated.</p>
      </section>
    </>
  );
}
