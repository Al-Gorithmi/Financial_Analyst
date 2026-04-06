"use client";

import { useState } from "react";
import ModelPicker from "@/components/ModelPicker";

const PRESETS = [
  {
    label: "JSON output (analysis)",
    prompt: `Tag this transaction. Return ONLY a JSON object:
{ "cat": string, "nec": string, "xfer": boolean, "mk": string, "tp": "debit"|"credit", "clean": string }

Transaction: 2026-03-15, "TIM HORTONS #1234 TORONTO", withdrawal $6.50`,
  },
  {
    label: "Plain text",
    prompt: "What is 2 + 2? Reply in one sentence.",
  },
  {
    label: "Finance insight",
    prompt: `You are a personal finance coach. The user spent $850 on groceries, $300 on dining, and $120 on coffee this month.
Return ONLY a JSON object: { "observations": [string], "recommendations": [string], "savings": [string] }`,
  },
];

export default function LLMTestPage() {
  const [model, setModel] = useState("local:gemma4:e2b");
  const [prompt, setPrompt] = useState(PRESETS[0].prompt);
  const [system, setSystem] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    setResponse("");
    setElapsed(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt, system: system || undefined }),
      });
      const data = await res.json() as { response?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      setResponse(data.response ?? "");
      setElapsed(Date.now() - start);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold text-zinc-100">LLM Test</h1>
        <ModelPicker value={model} onChange={setModel} />
      </div>

      <main className="px-8 py-6 flex flex-col gap-5 max-w-3xl">
        {/* Presets */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Presets:</span>
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setPrompt(p.prompt)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* System prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">System prompt (optional)</label>
          <textarea
            value={system}
            onChange={e => setSystem(e.target.value)}
            rows={2}
            placeholder="Leave empty for no system prompt"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
          />
        </div>

        {/* Prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-zinc-400">Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={6}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
          />
        </div>

        <button
          onClick={run}
          disabled={loading || !prompt.trim()}
          className="self-start inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Running…
            </>
          ) : "Send"}
        </button>

        {/* Response */}
        {(response || error) && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="border-b border-zinc-800 px-5 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400">Response</span>
              {elapsed !== null && (
                <span className="text-xs text-zinc-500">{(elapsed / 1000).toFixed(1)}s</span>
              )}
            </div>
            {error ? (
              <div className="px-5 py-4 text-sm text-red-400">{error}</div>
            ) : (
              <pre className="px-5 py-4 text-sm text-zinc-200 whitespace-pre-wrap font-mono overflow-x-auto">{response}</pre>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
