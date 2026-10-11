import { useEffect, useState } from "react";
import { getJson, type Opportunities } from "../lib/api";

export function OpportunitiesPage() {
  const [data, setData] = useState<Opportunities | null>(null);

  useEffect(() => {
    getJson<Opportunities>("/api/opportunities").then(setData).catch(() => undefined);
  }, []);

  return (
    <>
      <div className="pageHead">
        <p className="eyebrow">Opportunities</p>
        <h1>News-aware ticker screening</h1>
        <p className="lede">Pairs live metrics (premium, volatility, distance from 52-week range) with recent headlines. The model only sees the data the code hands it, and every headline it cites is checked to actually exist.</p>
      </div>

      <section className="panel">
        {!data ? (
          <p className="hint">Loading...</p>
        ) : !data.newsEnabled ? (
          <div className="statusBox">
            <strong>Not available right now</strong>
            <span>{data.reason ?? "News source not confirmed."}</span>
          </div>
        ) : (
          <p className="hint">News-based opportunities would appear here.</p>
        )}
      </section>
    </>
  );
}
