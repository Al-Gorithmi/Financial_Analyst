"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { parseMarkdownTable, parseAmount } from "@/lib/parse-table";
import type { RawTxnRow } from "@/lib/parse-table";
import ModelPicker from "@/components/ModelPicker";

interface StatementMeta {
  id: string;
  filename: string;
  uploadedAt: string;
  numPages: number;
  redactionCount: number;
  rawText?: string;
  parsedTransactions?: RawTxnRow[];
}

interface MonthGroup {
  month: string;      // YYYY-MM
  label: string;      // "February 2026"
  rows: RawTxnRow[];
  statementIds: string[];
  estimatedSpend: number;
  isNew: boolean;
}

type MonthStatus = "idle" | "running" | "done" | "error";

function toMonthLabel(month: string) {
  return new Date(month + "-02").toLocaleDateString("en-CA", { year: "numeric", month: "long" });
}

function fmt(n: number) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnalysePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <AnalyseContent />
    </Suspense>
  );
}

function AnalyseContent() {
  const searchParams = useSearchParams();
  const ids = (searchParams.get("ids") ?? "").split(",").filter(Boolean);

  const [months, setMonths] = useState<MonthGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Record<string, MonthStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doneCount, setDoneCount] = useState(0);
  const [selectedModel, setSelectedModel] = useState("local:gemma4:e2b");

  useEffect(() => {
    if (ids.length === 0) { setError("No statement IDs provided."); setLoading(false); return; }

    (async () => {
      // Load persisted model
      fetch("/api/config").then(r => r.json()).then((cfg: { selectedModel?: string }) => {
        if (cfg.selectedModel) setSelectedModel(cfg.selectedModel);
      }).catch(() => {});

      try {
        const stmts: StatementMeta[] = await Promise.all(
          ids.map(id =>
            fetch(`/api/statements/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
          )
        );
        const valid = stmts.filter(Boolean) as StatementMeta[];

        const config = await fetch("/api/config").then(r => r.json()).catch(() => ({}));
        const latestDate: string | undefined = config.latestAnalyzedDate;

        const monthMap = new Map<string, { rows: RawTxnRow[]; ids: Set<string> }>();
        for (const stmt of valid) {
          const rows = stmt.parsedTransactions ?? parseMarkdownTable(stmt.rawText ?? "", stmt.uploadedAt);
          for (const row of rows) {
            const m = row.dateISO.slice(0, 7);
            if (!m || m.length !== 7) continue;
            if (!monthMap.has(m)) monthMap.set(m, { rows: [], ids: new Set() });
            monthMap.get(m)!.rows.push(row);
            monthMap.get(m)!.ids.add(stmt.id);
          }
        }

        const groups: MonthGroup[] = [];
        for (const [month, { rows, ids: mIds }] of monthMap) {
          const seen = new Set<string>();
          const unique = rows.filter(r => {
            const sig = `${r.dateISO}|${r.description.slice(0, 30)}|${r.withdrawals}|${r.deposits}`;
            if (seen.has(sig)) return false;
            seen.add(sig);
            return true;
          });
          const estimatedSpend = unique.reduce((s, r) => s + parseAmount(r.withdrawals), 0);
          const isNew = !latestDate || month > latestDate.slice(0, 7);
          groups.push({ month, label: toMonthLabel(month), rows: unique, statementIds: [...mIds], estimatedSpend, isNew });
        }

        groups.sort((a, b) => b.month.localeCompare(a.month));
        setMonths(groups);

        // Auto-select all "new" months
        const newMonths = groups.filter(g => g.isNew).map(g => g.month);
        setSelected(new Set(newMonths.length > 0 ? newMonths : groups.map(g => g.month)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load statements");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMonth(month: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === months.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(months.map(m => m.month)));
    }
  }

  const isAnyRunning = Object.values(statuses).some(s => s === "running");

  async function analyseMonth(group: MonthGroup) {
    setStatuses(prev => ({ ...prev, [group.month]: "running" }));
    setErrors(prev => { const n = { ...prev }; delete n[group.month]; return n; });
    try {
      const res = await fetch("/api/analyse-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: group.month, statementIds: group.statementIds, model: selectedModel }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setStatuses(prev => ({ ...prev, [group.month]: "done" }));
      setDoneCount(prev => prev + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setStatuses(prev => ({ ...prev, [group.month]: "error" }));
      setErrors(prev => ({ ...prev, [group.month]: msg }));
    }
  }

  async function analyseSelected() {
    const toRun = months.filter(g => selected.has(g.month) && statuses[g.month] !== "done");
    if (toRun.length === 0) return;
    setStatuses(prev => {
      const next = { ...prev };
      for (const g of toRun) next[g.month] = "running";
      return next;
    });
    await Promise.allSettled(toRun.map(analyseMonth));
  }

  const selectedCount = selected.size;
  const runningCount = Object.values(statuses).filter(s => s === "running").length;
  const totalDone = Object.values(statuses).filter(s => s === "done").length;
  const allSelectedDone = selectedCount > 0 && [...selected].every(m => statuses[m] === "done");

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold text-zinc-100">Analyse by Month</h1>
        <ModelPicker
          value={selectedModel}
          onChange={model => {
            setSelectedModel(model);
            fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedModel: model }) }).catch(() => {});
          }}
        />
        {months.length > 0 && (
          <p className="text-xs text-zinc-500 ml-auto">
            {months.reduce((s, m) => s + m.rows.length, 0)} transactions · {months.length} month{months.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      <main className="px-8 py-6 flex flex-col gap-6">
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 px-6 py-5">
            <p className="text-sm text-red-300">{error}</p>
            <Link href="/upload" className="mt-3 inline-block text-sm font-medium text-red-300 underline">Back to upload</Link>
          </div>
        )}

        {loading && (
          <div className="flex flex-col gap-3 animate-pulse">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-zinc-800" />
            ))}
          </div>
        )}

        {!loading && months.length === 0 && !error && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <p className="text-sm text-zinc-400">No transaction data found in these statements.</p>
            <Link href="/upload" className="mt-4 inline-block text-sm font-medium text-blue-400 underline">Re-upload</Link>
          </div>
        )}

        {months.length > 0 && (
          <>
            {/* Progress bar when running */}
            {isAnyRunning && (
              <div className="rounded-xl border border-blue-900 bg-blue-950/30 px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-blue-300">
                    Analysing {runningCount} month{runningCount !== 1 ? "s" : ""} in parallel…
                  </p>
                  <p className="text-xs text-blue-400">{totalDone} / {selectedCount} done</p>
                </div>
                <div className="h-1.5 rounded-full bg-blue-900/50">
                  <div
                    className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
                    style={{ width: selectedCount > 0 ? `${(totalDone / selectedCount) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            )}

            {/* All done banner */}
            {allSelectedDone && !isAnyRunning && (
              <div className="flex items-center justify-between rounded-xl border border-green-900 bg-green-950/30 px-5 py-4">
                <p className="text-sm font-medium text-green-300">
                  {doneCount} month{doneCount !== 1 ? "s" : ""} analysed successfully
                </p>
                <Link
                  href="/analyses"
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-500"
                >
                  View Analyses →
                </Link>
              </div>
            )}

            <div className="overflow-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === months.length && months.length > 0}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-5 py-3 text-left font-medium">Month</th>
                    <th className="px-5 py-3 text-right font-medium">Transactions</th>
                    <th className="px-5 py-3 text-right font-medium">Est. Spend</th>
                    <th className="px-5 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {months.map((group) => {
                    const status = statuses[group.month] ?? "idle";
                    const isRunning = status === "running";
                    const isDone = status === "done";
                    const isErrored = status === "error";
                    const isSelected = selected.has(group.month);

                    return (
                      <tr
                        key={group.month}
                        className={[
                          "transition-colors",
                          isSelected ? "bg-blue-950/10" : "bg-zinc-950",
                          !isRunning ? "hover:bg-zinc-900/60 cursor-pointer" : "",
                        ].join(" ")}
                        onClick={() => !isRunning && !isDone && toggleMonth(group.month)}
                      >
                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => !isRunning && !isDone && toggleMonth(group.month)}
                            disabled={isRunning || isDone}
                            className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-blue-500 cursor-pointer disabled:opacity-40"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-zinc-100">{group.label}</span>
                            {group.isNew && status === "idle" && (
                              <span className="rounded-full bg-blue-950/50 px-2 py-0.5 text-[10px] font-medium text-blue-400">New</span>
                            )}
                          </div>
                          {isErrored && (
                            <p className="mt-0.5 text-xs text-red-400">{errors[group.month]}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums text-zinc-400">
                          {group.rows.length}
                        </td>
                        <td className="px-5 py-3.5 text-right tabular-nums font-mono text-zinc-300">
                          ${fmt(group.estimatedSpend)}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          {isRunning ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-950/50 px-2.5 py-1 text-[11px] font-medium text-blue-300">
                              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
                              Running
                            </span>
                          ) : isDone ? (
                            <Link
                              href={`/analyses/${group.month}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 rounded-full bg-green-950/50 px-2.5 py-1 text-[11px] font-medium text-green-400 hover:bg-green-900/50"
                            >
                              Done · View →
                            </Link>
                          ) : isErrored ? (
                            <button
                              onClick={e => { e.stopPropagation(); analyseMonth(group); }}
                              className="inline-flex items-center gap-1.5 rounded-full bg-red-950/50 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-900/60 transition-colors"
                            >
                              Error · Retry ↺
                            </button>
                          ) : isSelected ? (
                            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-400">Selected</span>
                          ) : (
                            <span className="rounded-full bg-zinc-800/50 px-2.5 py-1 text-[11px] font-medium text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {selectedCount > 0
                  ? `${selectedCount} month${selectedCount !== 1 ? "s" : ""} selected`
                  : "Select months to analyse"}
              </p>
              <button
                onClick={analyseSelected}
                disabled={selectedCount === 0 || isAnyRunning || allSelectedDone}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isAnyRunning ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Analysing {runningCount} month{runningCount !== 1 ? "s" : ""}…
                  </>
                ) : (
                  `Analyse ${selectedCount > 0 ? `${selectedCount} ` : ""}Selected Month${selectedCount !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
