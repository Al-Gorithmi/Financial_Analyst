// Unified LLM router
// Model string format:
//   "local:gemma4:e2b"         → Ollama on LOCAL_LLM_BASE_URL
//   "claude:claude-sonnet-4-6" → Anthropic
//   "openai:gpt-5"             → OpenAI

import { localGenerate } from "./local-llm";
import { anthropic } from "./claude";
import { openai } from "./openai";

export type ModelSpec = string;

export const DEFAULT_MODEL: ModelSpec = "local:gemma4:e2b";

export function parseModel(m: ModelSpec): { provider: "local" | "claude" | "openai"; name: string } {
  if (m.startsWith("local:")) return { provider: "local", name: m.slice(6) };
  if (m.startsWith("claude:")) return { provider: "claude", name: m.slice(7) };
  if (m.startsWith("openai:")) return { provider: "openai", name: m.slice(7) };
  return { provider: "local", name: m }; // bare model name → local
}

export async function callLLM(
  prompt: string,
  opts: { model: ModelSpec; system?: string; maxTokens?: number }
): Promise<string> {
  const { provider, name } = parseModel(opts.model);
  const maxTokens = opts.maxTokens ?? 8192;

  if (provider === "local") {
    return localGenerate(name, prompt, { system: opts.system });
  }

  if (provider === "claude") {
    const msg = await anthropic.messages.create({
      model: name,
      max_tokens: maxTokens,
      ...(opts.system && { system: opts.system }),
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text : "";
  }

  if (provider === "openai") {
    const messages: { role: "system" | "user"; content: string }[] = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    const completion = await openai.chat.completions.create({
      model: name,
      max_completion_tokens: maxTokens,
      messages,
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  throw new Error(`Unknown model: ${opts.model}`);
}
