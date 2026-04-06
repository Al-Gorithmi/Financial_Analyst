// Ollama-compatible local LLM client

const BASE = () => process.env.LOCAL_LLM_BASE_URL ?? "http://100.105.247.98/api/llm/api";

export async function localGenerate(
  model: string,
  prompt: string,
  opts?: { system?: string; images?: string[] }
): Promise<string> {
  const body: Record<string, unknown> = { model, prompt, stream: false };
  if (opts?.system) body.system = opts.system;
  if (opts?.images?.length) body.images = opts.images;

  const res = await fetch(`${BASE()}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // 2 min — local models can be slow
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Local LLM ${res.status}: ${text}`);
  }

  const data = await res.json() as { response?: string };
  return data.response ?? "";
}

export async function listLocalModels(): Promise<string[]> {
  try {
    const res = await fetch(`${BASE()}/tags`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return [];
    const data = await res.json() as { models?: { name: string }[] };
    return (data.models ?? []).map(m => m.name);
  } catch {
    return [];
  }
}
