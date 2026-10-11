import { useOutletContext } from "react-router-dom";
import type { MarketOverview, PivotSettings } from "./api";

export type ShellContext = {
  settings: PivotSettings | null;
  overview: MarketOverview | null;
  loading: boolean;
  refresh: () => Promise<void>;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
};

export function useShell() {
  return useOutletContext<ShellContext>();
}
