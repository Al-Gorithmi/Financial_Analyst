"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { SpanStats } from "@/app/api/metrics/route";
import type { TraceRecord } from "@/lib/file-span-exporter";

interface MetricsData {
  stats: SpanStats[];
  recent: TraceRecord[];
  totalRecords: number;
}

function fmt(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800">
      <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const SPAN_COLORS: Record<string, string> = {
  "claude.pdf_extract": "bg-violet-500",
  "claude.analyse":     "bg-blue-500",
  "openai.analyse":     "bg-green-500",
  "pii.scrub":          "bg-amber-500",
};

function spanColor(name: string) {
  return SPAN_COLORS[name] ?? "bg-zinc-500";
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/metrics");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function clearTraces() {
    setClearing(true);
    await fetch("/api/metrics", { method: "DELETE" });
    await load();
    setClearing(false);
  }

  const maxAvg = Math.max(...(data?.stats.map(s => s.avgMs) ?? [1]));

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-100">Performance Metrics</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{data?.totalRecords ?? 0} spans recorded</span>
          <button onClick={load} className="rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">Refresh</button>
          <button onClick={clearTraces} disabled={clearing} className="rounded-md px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30 disabled:opacity-50">Clear</button>
        </div>
      </div>

      <main className="px-8 py-6 flex flex-col gap-6">
        {/* Summary cards */}
        {data && data.stats.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.stats.map((s) => (
                <div key={s.name} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${spanColor(s.name)}`} />
                    <span className="text-xs font-mono text-zinc-300 truncate">{s.name}</span>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-zinc-100">{fmt(s.avgMs)}</p>
                    <p className="text-xs text-zinc-500">avg · {s.count} call{s.count !== 1 ? "s" : ""}</p>
                  </div>
                  <Bar value={s.avgMs} max={maxAvg} className={spanColor(s.name)} />
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>p50 {fmt(s.p50Ms)}</span>
                    <span>p95 {fmt(s.p95Ms)}</span>
                    <span>max {fmt(s.maxMs)}</span>
                  </div>
                  {s.errorRate > 0 && (
                    <span className="text-[10px] text-red-400">{Math.round(s.errorRate * 100)}% errors</span>
                  )}
                </div>
              ))}
            </div>

            {/* Recent timeline */}
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-zinc-300">Recent spans</h2>
              <div className="overflow-auto rounded-xl border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Span</th>
                      <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                      <th className="px-4 py-2.5 text-left font-medium">Attributes</th>
                      <th className="px-4 py-2.5 text-left font-medium">Time</th>
                      <th className="px-4 py-2.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {data.recent.map((r, i) => (
                      <tr key={i} className="bg-zinc-950 hover:bg-zinc-900/60">
                        <td className="px-4 py-2 font-mono text-zinc-300">
                          <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${spanColor(r.name)}`} />
                          {r.name}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-zinc-100 whitespace-nowrap">
                          {fmt(r.durationMs)}
                        </td>
                        <td className="px-4 py-2 text-zinc-500 max-w-xs truncate">
                          {Object.entries(r.attributes).map(([k, v]) => `${k}=${v}`).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2 text-zinc-500 whitespace-nowrap">
                          {new Date(r.startMs).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {r.status === "error" ? (
                            <span className="rounded-full bg-red-950/50 px-2 py-0.5 text-red-400">error</span>
                          ) : (
                            <span className="rounded-full bg-green-950/50 px-2 py-0.5 text-green-400">ok</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
            <p className="text-sm text-zinc-400">No spans recorded yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Spans are collected automatically when you upload and analyse statements.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
