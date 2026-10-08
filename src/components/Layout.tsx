import {
  Activity,
  ClipboardCheck,
  Cpu,
  Link2,
  PieChart,
  RefreshCw,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getJson, shortAddress, type Health, type Quote, type WalletReadiness } from "../lib/api";

const navItems = [
  { to: "/", label: "Monitor", icon: Activity, end: true },
  { to: "/wallet", label: "Wallet Skills", icon: WalletCards, end: false },
  { to: "/agent", label: "Agent Studio", icon: Cpu, end: false },
  { to: "/baskets", label: "Baskets", icon: PieChart, end: false },
  { to: "/risk", label: "Risk Rules", icon: ShieldCheck, end: false },
  { to: "/judge", label: "Judge Mode", icon: ClipboardCheck, end: false }
];

export function Layout() {
  const [health, setHealth] = useState<Health | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [marketMode, setMarketMode] = useState("loading");
  const [cacheStatus, setCacheStatus] = useState("loading");
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletReadiness, setWalletReadiness] = useState<WalletReadiness | null>(null);
  const [risk, setRisk] = useState<"balanced" | "aggressive">("balanced");
  const [platform, setPlatform] = useState<"bstock" | "ondo" | "all">("bstock");
  const [tab, setTab] = useState(9);
  const [maxTradeUsd, setMaxTradeUsd] = useState(10);

  async function refresh() {
    setLoading(true);
    // Sector/tab is a bStocks-only categorization (Binance's internal catalog tabs); other
    // platforms are fetched unfiltered by sector.
    const marketQuery = platform === "bstock" ? `?platform=${platform}&tab=${tab}` : `?platform=${platform}`;
    const [healthData, marketData] = await Promise.all([
      getJson<Health>("/api/health"),
      getJson<{ mode: string; cacheStatus?: string; quotes: Quote[] }>(`/api/market${marketQuery}`)
    ]);
    setHealth(healthData);
    setQuotes(marketData.quotes);
    setMarketMode(marketData.mode);
    setCacheStatus(marketData.cacheStatus ?? "live");
    setLoading(false);
  }

  async function refreshWalletReadiness() {
    if (!walletAddress) return;
    const data = await getJson<WalletReadiness>(`/api/wallet/readiness/${walletAddress}`);
    setWalletReadiness(data);
  }

  function applyAccount(account: string | null) {
    setWalletAddress(account);
    if (account) {
      getJson<WalletReadiness>(`/api/wallet/readiness/${account}`).then(setWalletReadiness).catch(() => undefined);
    } else {
      setWalletReadiness(null);
    }
  }

  async function connectWallet() {
    if (!window.ethereum) return;
    const accounts = await window.ethereum.request<string[]>({ method: "eth_requestAccounts" });
    applyAccount(accounts[0] ?? null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, tab]);

  // Pick up an already-authorized wallet on load, and react live to account switches or
  // disconnects made from the wallet extension itself (not just the Connect button).
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request<string[]>({ method: "eth_accounts" })
      .then((accounts) => applyAccount(accounts?.[0] ?? null))
      .catch(() => undefined);

    function handleAccountsChanged(...args: unknown[]) {
      const accounts = (args[0] as string[] | undefined) ?? [];
      applyAccount(accounts[0] ?? null);
    }

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("disconnect", handleAccountsChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("disconnect", handleAccountsChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bestSpread = quotes.length
    ? [...quotes].sort((a, b) => Math.abs(b.spreadBps) - Math.abs(a.spreadBps))[0]
    : null;

  const shellContext = {
    health,
    quotes,
    marketMode,
    cacheStatus,
    loading,
    refresh,
    bestSpread,
    walletAddress,
    walletReadiness,
    connectWallet,
    refreshWalletReadiness,
    risk,
    setRisk,
    platform,
    setPlatform,
    tab,
    setTab,
    maxTradeUsd,
    setMaxTradeUsd
  };

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CS</div>
          <div>
            <strong>CircuitStock</strong>
            <span>Agentic tokenized stocks</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebarFoot">
          <span>BNB Hack: Tokenized Stocks Edition</span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="metrics">
            <div>
              <span>API key</span>
              <strong>{health?.apiConfigured ? health.apiKeyStatus : "Missing"}</strong>
            </div>
            <div>
              <span>Market data</span>
              <strong>{marketMode}</strong>
            </div>
            <div>
              <span>Largest spread</span>
              <strong>{bestSpread ? `${Math.abs(bestSpread.spreadBps)} bps` : "--"}</strong>
            </div>
          </div>
          <div className="topbarActions">
            <button className={walletAddress ? "walletButton connected" : "walletButton"} onClick={connectWallet}>
              {walletAddress ? (
                <>
                  <span className="statusDot" />
                  Connected <small>{shortAddress(walletAddress)}</small>
                </>
              ) : (
                <>
                  <Link2 size={16} />
                  Connect wallet
                </>
              )}
            </button>
            <button className="iconButton" onClick={refresh} title="Refresh data" aria-label="Refresh data">
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>

        <Outlet context={shellContext} />
      </section>
    </main>
  );
}
