import { useState } from "react";
import { NumberStepper } from "../components/NumberStepper";
import { compactUsd, currency, getJson, type BasketPlan } from "../lib/api";
import { useShell } from "../lib/shell";

export function BasketsPage() {
  const { risk, platform } = useShell();
  const [basketTheme, setBasketTheme] = useState("ai-chips");
  const [basketAmount, setBasketAmount] = useState(25);
  const [basket, setBasket] = useState<BasketPlan | null>(null);

  async function planBasket() {
    const data = await getJson<BasketPlan>("/api/baskets/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: basketTheme, amountUsd: basketAmount, risk, platforms: [platform] })
    });
    setBasket(data);
  }

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Thematic baskets</p>
        <h1>One-tap tokenized stock basket plan</h1>
        <p className="lede">Builds a BSC-only, spot-only, no-broadcast basket using the same live RWA scanner as Monitor.</p>
      </div>

      <section className="panel">
        <div className="basketControls">
          <label>
            Theme
            <select value={basketTheme} onChange={(event) => setBasketTheme(event.target.value)}>
              <option value="ai-chips">AI Chips</option>
              <option value="magnificent-7">Magnificent 7</option>
              <option value="etf">ETF Core</option>
              <option value="buffett">Buffett Portfolio</option>
            </select>
          </label>
          <label>
            Basket USD
            <NumberStepper value={basketAmount} onChange={setBasketAmount} min={5} step={5} />
          </label>
          <button onClick={planBasket}>Plan basket</button>
        </div>

        {basket ? (
          <>
            <p className="statusLine">
              <strong>
                {basket.label}: {basket.summary}
              </strong>
              <span>
                {basket.thesis} {basket.requiredUserAction}
              </span>
            </p>
            <div className="basketRows">
              {basket.legs.map((leg) => (
                <article key={leg.symbol}>
                  <div>
                    <strong>{leg.symbol}</strong>
                    <span>
                      {currency.format(leg.allocationUsd)} &middot; {leg.weightPct}%
                    </span>
                  </div>
                  <p>{leg.reason}</p>
                  <small>
                    {leg.action} &middot; spread {leg.spreadBps} bps &middot; liquidity {compactUsd.format(leg.liquidityUsd)}
                  </small>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="hint">Pick a theme and an amount, then plan the basket.</p>
        )}
      </section>
    </>
  );
}
