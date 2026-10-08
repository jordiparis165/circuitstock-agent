import type { AgentAction, AgentSnapshot } from "./types";

export function marketAction(snapshot: AgentSnapshot, nowSec = Math.floor(Date.now() / 1000)): AgentAction {
  if (!snapshot.market.open) {
    return snapshot.market.next_open > 0 && nowSec >= snapshot.market.next_open + 900 ? "reenter" : "hold";
  }
  if (snapshot.market.next_close > 0 && snapshot.market.next_close - nowSec <= 900) return "derisk";
  return "rotate";
}

