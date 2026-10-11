import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";
import type { AgentSnapshot } from "./types";

/**
 * Loads the snapshot replay mode serves.
 *
 * In the app this is `fixtures/snapshot.sample.json`, written by `scripts/record-snapshot.ts`
 * from real Binance RWA data, so its contents change every time we record. Tests therefore point
 * `AGENT_SNAPSHOT_PATH` at a fixed fixture instead: a test must not break because the market moved.
 */
export function loadSampleSnapshot(): AgentSnapshot {
  const configured = pickEnv(["AGENT_SNAPSHOT_PATH"]) ?? "fixtures/snapshot.sample.json";
  const fixturePath = path.resolve(process.cwd(), configured);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as AgentSnapshot;
}
