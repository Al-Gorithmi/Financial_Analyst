"use client";

import { useEffect, useState } from "react";

const CLOUD_MODELS = [
  { value: "claude:claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { value: "openai:gpt-5", label: "GPT-5", provider: "OpenAI" },
];

interface Props {
  value: string;
  onChange: (model: string) => void;
  className?: string;
}

export default function ModelPicker({ value, onChange, className = "" }: Props) {
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localOnline, setLocalOnline] = useState<boolean | null>(null); // null = checking

  useEffect(() => {
    fetch("/api/llm/models")
      .then(r => r.json())
      .then((data: { models: string[] }) => {
        setLocalModels(data.models ?? []);
        setLocalOnline((data.models ?? []).length > 0);
      })
      .catch(() => setLocalOnline(false));
  }, []);

  const { provider } = parseModelSpec(value);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-zinc-500 font-medium shrink-0">Model</span>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="appearance-none rounded-md border border-zinc-700 bg-zinc-800 pl-3 pr-7 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        >
          <optgroup label={`Local${localOnline === null ? " (checking…)" : localOnline ? "" : " (offline)"}`}>
            {localModels.map(m => (
              <option key={m} value={`local:${m}`}>{m}</option>
            ))}
            {localModels.length === 0 && (
              <option value="" disabled>{localOnline === false ? "Server unreachable" : "Loading…"}</option>
            )}
          </optgroup>
          <optgroup label="Cloud">
            {CLOUD_MODELS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </optgroup>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <svg className="h-3 w-3 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      <span className={[
        "text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0",
        provider === "local"
          ? localOnline ? "bg-green-950/50 text-green-400" : "bg-zinc-800 text-zinc-500"
          : provider === "claude"
          ? "bg-orange-950/50 text-orange-400"
          : "bg-blue-950/50 text-blue-400",
      ].join(" ")}>
        {provider === "local"
          ? localOnline === null ? "…" : localOnline ? "Local" : "Offline"
          : provider === "claude" ? "Anthropic" : "OpenAI"}
      </span>
    </div>
  );
}

function parseModelSpec(m: string): { provider: "local" | "claude" | "openai" } {
  if (m.startsWith("claude:")) return { provider: "claude" };
  if (m.startsWith("openai:")) return { provider: "openai" };
  return { provider: "local" };
}
