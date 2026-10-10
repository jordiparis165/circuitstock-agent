import fs from "node:fs";
import path from "node:path";
import { pickEnv } from "../env";

export type SkillLogEntry = {
  at: string;
  skill: string;
  endpoint: string;
  status: "ok" | "failed" | "disabled";
  latencyMs: number;
  summary: string;
};

const entries: SkillLogEntry[] = [];

function logPath(): string {
  return path.resolve(process.cwd(), pickEnv(["SKILLS_LOG_PATH"]) ?? "data/skills-log.jsonl");
}

export function logSkillCall(entry: SkillLogEntry): SkillLogEntry {
  entries.push(entry);
  entries.splice(0, Math.max(0, entries.length - 200));
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    fs.appendFileSync(logPath(), `${JSON.stringify(entry)}\n`);
  } catch {
    // In-memory log is enough on read-only hosts.
  }
  return entry;
}

export function recentSkillCalls(limit = 25): SkillLogEntry[] {
  try {
    const persisted = fs
      .readFileSync(logPath(), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SkillLogEntry);
    return [...persisted, ...entries].slice(-limit).reverse();
  } catch {
    return entries.slice(-limit).reverse();
  }
}

