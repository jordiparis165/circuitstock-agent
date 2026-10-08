import { useOutletContext } from "react-router-dom";
import type { Health, Quote, WalletReadiness } from "./api";

export type ShellContext = {
  health: Health | null;
  quotes: Quote[];
  marketMode: string;
  cacheStatus: string;
  loading: boolean;
  refresh: () => Promise<void>;
  bestSpread: Quote | null;
  walletAddress: string | null;
  walletReadiness: WalletReadiness | null;
  connectWallet: () => Promise<void>;
  refreshWalletReadiness: () => Promise<void>;
  risk: "balanced" | "aggressive";
  setRisk: (risk: "balanced" | "aggressive") => void;
  platform: "bstock" | "ondo" | "all";
  setPlatform: (platform: "bstock" | "ondo" | "all") => void;
  tab: number;
  setTab: (tab: number) => void;
  maxTradeUsd: number;
  setMaxTradeUsd: (value: number) => void;
};

export function useShell() {
  return useOutletContext<ShellContext>();
}
