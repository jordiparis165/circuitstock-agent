import {
  Bell,
  CalendarClock,
  LayoutDashboard,
  Link2,
  MessageCircle,
  Newspaper,
  Power,
  Puzzle,
  ScrollText,
  SlidersHorizontal,
  Wallet
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getJson, shortAddress, type MarketOverview, type PivotSettings } from "../lib/api";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/agent", label: "Agent", icon: MessageCircle, end: false },
  { to: "/portfolio", label: "Portfolio", icon: Wallet, end: false },
  { to: "/alerts", label: "Alerts", icon: Bell, end: false },
  { to: "/plans", label: "Plans", icon: CalendarClock, end: false },
  { to: "/opportunities", label: "Opportunities", icon: Newspaper, end: false, experimental: true },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal, end: false },
  { to: "/activity", label: "Activity", icon: ScrollText, end: false },
  { to: "/skills", label: "Skills", icon: Puzzle, end: false }
];

export function Layout() {
  const [settings, setSettings] = useState<PivotSettings | null>(null);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const [settingsData, overviewData] = await Promise.all([
      getJson<{ settings: PivotSettings }>("/api/settings").catch(() => null),
      getJson<MarketOverview>("/api/market/overview").catch(() => null)
    ]);
    setSettings(settingsData?.settings ?? null);
    setOverview(overviewData);
    setLoading(false);
  }

  async function toggleAgent() {
    const next = !settings?.agent_enabled;
    const data = await getJson<{ settings: PivotSettings }>("/api/settings/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next })
    });
    setSettings(data.settings);
  }

  async function connectWallet() {
    if (!window.ethereum) return;
    const accounts = await window.ethereum.request<string[]>({ method: "eth_requestAccounts" });
    setWalletAddress(accounts?.[0] ?? null);
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x38",
            chainName: "BNB Smart Chain",
            nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org"],
            blockExplorerUrls: ["https://bscscan.com"]
          }
        ]
      });
    }
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  // Pick up an already-authorized wallet, and follow account switches made in the extension.
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request<string[]>({ method: "eth_accounts" })
      .then((accounts) => setWalletAddress(accounts?.[0] ?? null))
      .catch(() => undefined);

    function handleAccountsChanged(...args: unknown[]) {
      const accounts = (args[0] as string[] | undefined) ?? [];
      setWalletAddress(accounts[0] ?? null);
    }

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("disconnect", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("disconnect", handleAccountsChanged);
    };
  }, []);

  const shellContext = { settings, overview, loading, refresh, walletAddress, connectWallet };

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CS</div>
          <strong>CircuitStock</strong>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={18} />
                {item.label}
                {"experimental" in item && item.experimental && <span className="expTag">exp</span>}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebarFoot">
          <span>Informational &amp; experimental - not financial advice</span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="metrics">
            <div>
              <span>Agent</span>
              <strong className={settings?.agent_enabled ? "statusOn" : "statusOff"}>
                {settings === null ? "..." : settings.agent_enabled ? "Active" : "Disabled"}
              </strong>
            </div>
            <div>
              <span>Market</span>
              <strong>{overview ? (overview.market.open ? "Open" : "Closed") : "..."}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{settings?.preset ?? "..."}</strong>
            </div>
            <div>
              <span>Data</span>
              <strong className="replayBadge" title={overview?.capturedAt ? `captured ${new Date(overview.capturedAt).toLocaleString()}` : undefined}>
                {overview?.replay ? "REPLAY" : "LIVE"}
              </strong>
            </div>
          </div>
          <div className="topbarActions">
            <span className="simulatedPill">Simulated only</span>
            {/* T4: the kill switch must be reachable from every page, not just Settings. */}
            <button
              className={settings?.agent_enabled ? "killButton small" : "walletButton"}
              onClick={toggleAgent}
              disabled={settings === null}
              title={settings?.agent_enabled ? "Stop all agent actions immediately" : "Allow the agent to produce suggestions again"}
            >
              <Power size={15} />
              {settings?.agent_enabled ? "Disable agent" : "Enable agent"}
            </button>
            <button className={walletAddress ? "walletButton connected" : "walletButton"} onClick={connectWallet}>
              {walletAddress ? (
                <>
                  <span className="statusDot" />
                  {shortAddress(walletAddress)}
                </>
              ) : (
                <>
                  <Link2 size={16} />
                  Connect wallet
                </>
              )}
            </button>
          </div>
        </header>

        <Outlet context={shellContext} />
      </section>
    </main>
  );
}
