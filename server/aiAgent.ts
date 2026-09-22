import { pickEnv } from "./env";

export type AiAgentContext = {
  prompt: string;
  opportunities: unknown[];
  basket?: unknown;
  watcher?: unknown;
  readiness?: unknown;
};

export type AiAgentResult = {
  ok: boolean;
  mode: "llm" | "deterministic";
  configured: boolean;
  model: string;
  answer: string;
  safety: {
    broadcasts_transactions: false;
    requires_user_signature: true;
    chain: "BSC mainnet";
  };
  error?: string;
};

const defaultModel = pickEnv(["OPENAI_MODEL"]) ?? "gpt-5";

function deterministicAnswer(context: AiAgentContext, reason?: string): AiAgentResult {
  const top = (context.opportunities[0] ?? {}) as { symbol?: string; spreadBps?: number; direction?: string; score?: number };
  const lead = top.symbol
    ? `Top live signal is ${top.symbol}: ${top.direction ?? "watch"} at ${top.spreadBps ?? "--"} bps, score ${top.score ?? "--"}.`
    : "No live opportunity is available right now.";
  return {
    ok: true,
    mode: "deterministic",
    configured: Boolean(pickEnv(["OPENAI_API_KEY"])),
    model: defaultModel,
    answer: `${lead} Recommended next step: prepare a small quote, verify approval and simulation, then ask the user to sign only. CircuitStock must not broadcast.`,
    safety: {
      broadcasts_transactions: false,
      requires_user_signature: true,
      chain: "BSC mainnet"
    },
    error: reason
  };
}

function extractOutputText(payload: unknown): string {
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const output = (payload as { output?: Array<{ content?: Array<{ text?: string; type?: string }> }> }).output ?? [];
  const text = output
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  return text;
}

export async function runAiAgent(context: AiAgentContext): Promise<AiAgentResult> {
  const apiKey = pickEnv(["OPENAI_API_KEY"]);
  if (!apiKey) return deterministicAnswer(context, "OPENAI_API_KEY is not configured; deterministic fallback used.");

  const instructions = [
    "You are CircuitStock AI, a cautious tokenized-stocks agent for BSC mainnet.",
    "Use the provided live context only. Do not invent prices, routes, balances, or transaction status.",
    "You may recommend scan, watch, prepare quote, approval, simulation, or user signature.",
    "Never recommend automatic broadcast. Always mention user signature and no-broadcast boundary.",
    "Keep the response short, judge-friendly, and action-oriented."
  ].join(" ");

  const input = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify(
            {
              userPrompt: context.prompt,
              liveContext: {
                opportunities: context.opportunities,
                basket: context.basket,
                watcher: context.watcher,
                readiness: context.readiness
              }
            },
            null,
            2
          )
        }
      ]
    }
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: defaultModel,
        instructions,
        input,
        max_output_tokens: 700
      })
    });
    const payload = await response.json();
    if (!response.ok) return deterministicAnswer(context, JSON.stringify(payload));
    const answer = extractOutputText(payload);
    if (!answer) return deterministicAnswer(context, "OpenAI response had no text output.");
    return {
      ok: true,
      mode: "llm",
      configured: true,
      model: defaultModel,
      answer,
      safety: {
        broadcasts_transactions: false,
        requires_user_signature: true,
        chain: "BSC mainnet"
      }
    };
  } catch (error) {
    return deterministicAnswer(context, (error as Error).message);
  }
}
