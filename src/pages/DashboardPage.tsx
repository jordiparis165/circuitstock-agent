import { ArrowRight, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useShell } from "../lib/shell";

type Row = {
  ticker: string;
  ondo: string;
  bstock: string;
  reference: string | null;
  spread: number;
  cheaper: "ondo" | "bstock";
  premium: number | null;
};

// Spread magnitude -> tile tint. Capped at 1% so one outlier doesn't flatten the rest of the scale.
function tint(spread: number) {
  const intensity = Math.min(Math.abs(spread) / 1, 1);
  return {
    background: `rgba(240, 185, 11, ${0.06 + intensity * 0.26})`,
    borderColor: `rgba(240, 185, 11, ${0.18 + intensity * 0.5})`
  };
}

export function DashboardPage() {
  const { overview, loading } = useShell();
  const navigate = useNavigate();

  const rows: Row[] = (overview?.heatmap ?? [])
    .map((row) => {
      const ondo = Number(row.ondo);
      const bstock = Number(row.bstock);
      const reference = row.reference ? Number(row.reference) : null;
      const cheapest = Math.min(ondo, bstock);
      return {
        ticker: row.ticker,
        ondo: row.ondo,
        bstock: row.bstock,
        reference: row.reference,
        spread: Number(row.gross_spread_pct),
        cheaper: ondo <= bstock ? ("ondo" as const) : ("bstock" as const),
        premium: reference ? ((cheapest - reference) / reference) * 100 : null
      };
    })
    .sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));

  const widest = rows[0];
  const withReference = rows.filter((row) => row.premium !== null);
  const avgPremium = withReference.length
    ? withReference.reduce((total, row) => total + (row.premium ?? 0), 0) / withReference.length
    : null;

  function askAgent(ticker: string) {
    navigate("/agent", { state: { ticker } });
  }

  if (loading && !overview) return <p className="hint">Loading market snapshot...</p>;

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Dashboard</p>
        <h1>Premium / discount heatmap</h1>
        <p className="lede">
          The same tokenized stock priced on two issuers (Ondo and bStock), compared against an independent reference. A wide spread is not a profit -
          route cost usually eats it. Click any ticker to ask the agent about it.
        </p>
      </div>

      <section className="kpiRow">
        <div className="kpi">
          <span>Tickers covered</span>
          <strong>{rows.length}</strong>
          <small>in the current snapshot</small>
        </div>
        <div className="kpi">
          <span>Widest spread</span>
          <strong className="accent">{widest ? `${Math.abs(widest.spread).toFixed(3)}%` : "--"}</strong>
          <small>{widest ? `${widest.ticker} - ${widest.cheaper} cheaper` : "no data"}</small>
        </div>
        <div className="kpi">
          <span>Avg premium vs reference</span>
          <strong className={avgPremium !== null && avgPremium < 0 ? "statusOn" : ""}>
            {avgPremium !== null ? `${avgPremium > 0 ? "+" : ""}${avgPremium.toFixed(3)}%` : "--"}
          </strong>
          <small>cheapest issuer vs Alpaca/Finnhub</small>
        </div>
        <div className="kpi">
          <span>Market</span>
          <strong>{overview?.market.open ? "Open" : "Closed"}</strong>
          <small>{overview?.market.state ?? "unknown"}</small>
        </div>
      </section>

      <section className="panel wide">
        <div className="panelHead">
          <div>
            <h2>Spread heatmap</h2>
            <p className="hint">Brighter tile = wider gap between the two issuers.</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="empty">No ticker data available right now.</p>
        ) : (
          <div className="heatGrid">
            {rows.map((row) => (
              <button type="button" key={row.ticker} className="heatTile" style={tint(row.spread)} onClick={() => askAgent(row.ticker)}>
                <span className="heatTicker">{row.ticker}</span>
                <span className="heatSpread">{Math.abs(row.spread).toFixed(2)}%</span>
                <span className="heatCheap">{row.cheaper} cheaper</span>
                {row.premium !== null && (
                  <span className={row.premium < 0 ? "heatPremium positive" : "heatPremium negative"}>
                    {row.premium > 0 ? "+" : ""}
                    {row.premium.toFixed(2)}% vs ref
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel wide">
        <div className="panelHead">
          <div>
            <h2>Detail</h2>
            <p className="hint">Price per share on each issuer, and the independent reference used to compute the premium.</p>
          </div>
          <button className="ghost" onClick={() => navigate("/agent")}>
            <MessageCircle size={15} />
            Ask the agent
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="empty">No ticker data available right now.</p>
        ) : (
          <div className="table">
            <div className="row head">
              <span>Ticker</span>
              <span>Ondo $/share</span>
              <span>bStock $/share</span>
              <span>Reference</span>
              <span>Spread</span>
            </div>
            {rows.map((row) => (
              <div className="row" key={row.ticker}>
                <span>
                  <strong>{row.ticker}</strong>
                </span>
                <span className={row.cheaper === "ondo" ? "cheapCell" : ""}>${row.ondo}</span>
                <span className={row.cheaper === "bstock" ? "cheapCell" : ""}>${row.bstock}</span>
                <span>{row.reference ? `$${row.reference}` : "--"}</span>
                <span className="spread">
                  <strong>{Math.abs(row.spread).toFixed(3)}%</strong>
                  <small>
                    {row.cheaper} cheaper
                    <ArrowRight size={11} />
                  </small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
