import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { TraceRecord } from "@/lib/file-span-exporter";

const TRACES_FILE = path.join(process.cwd(), "data", "traces.jsonl");

export interface SpanStats {
  name: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  errorRate: number; // 0–1
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export async function GET() {
  let records: TraceRecord[] = [];
  try {
    const text = fs.readFileSync(TRACES_FILE, "utf-8");
    records = text
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line) as TraceRecord);
  } catch {
    // No traces yet
  }

  // Group by span name
  const byName = new Map<string, TraceRecord[]>();
  for (const r of records) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name)!.push(r);
  }

  const stats: SpanStats[] = [];
  for (const [name, spans] of byName) {
    const durations = spans.map(s => s.durationMs).sort((a, b) => a - b);
    const errors = spans.filter(s => s.status === "error").length;
    stats.push({
      name,
      count: spans.length,
      avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      p50Ms: Math.round(percentile(durations, 50)),
      p95Ms: Math.round(percentile(durations, 95)),
      maxMs: Math.round(durations[durations.length - 1]),
      errorRate: errors / spans.length,
    });
  }

  // Also return recent raw records (last 100) for a timeline view
  const recent = records.slice(-100).reverse();

  return NextResponse.json({ stats, recent, totalRecords: records.length });
}

export async function DELETE() {
  try {
    fs.writeFileSync(TRACES_FILE, "", "utf-8");
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true });
}
