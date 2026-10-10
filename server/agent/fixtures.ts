import fs from "node:fs";
import path from "node:path";
import type { AgentSnapshot } from "./types";

export function loadSampleSnapshot(): AgentSnapshot {
  const fixturePath = path.resolve(process.cwd(), "fixtures/snapshot.sample.json");
  return JSON.parse(fs.readFileSync(fixturePath, "utf8")) as AgentSnapshot;
}

