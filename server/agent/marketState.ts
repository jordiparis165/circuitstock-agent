import { loadAgentConfig, type AgentConfig } from "./config";
import type { AgentAction, AgentSnapshot } from "./types";

export function marketAction(
  snapshot: AgentSnapshot,
  nowSec = Math.floor(Date.now() / 1000),
  config: AgentConfig = loadAgentConfig()
): AgentAction {
  if (!snapshot.market.open) {
    return snapshot.market.next_open > 0 && nowSec >= snapshot.market.next_open + config.reentryAfterOpenSec ? "reenter" : "hold";
  }
  if (snapshot.market.next_close > 0 && snapshot.market.next_close - nowSec <= config.deriskBeforeCloseSec) return "derisk";
  return "rotate";
}
