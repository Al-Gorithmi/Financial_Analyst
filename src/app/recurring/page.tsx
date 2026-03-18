"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { RecurringItem } from "@/lib/recurring";

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function freqLabel(f: RecurringItem["frequency"]) {
  return { weekly: "Weekly", "bi-weekly": "Bi-weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" }[f];
}

function confidenceBadge(c: RecurringItem["confidence"]) {
  const styles = { high: "bg-green-900/50 text-green-400", medium: "bg-amber-900/50 text-amber-400", low: "bg-zinc-800 text-zinc-400" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[c]}`}>{c}</span>;
}

export default function RecurringPage() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/recurring");
    setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const detect = async () => {
    setDetecting(true);
    const res = await fetch("/api/recurring", { method: "POST" });
    setItems(await res.json());
    setDetecting(false);
  };

  const patch = async (id: string, update: { confirmed?: boolean; dismissed?: boolean }) => {
    const res = await fetch("/api/recurring", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...update }) });
    const updated = await res.json();
    setItems(prev => prev.map(r => r.id === id ? updated : r));
  };

  const visible = items.filter(r => showDismissed ? true : !r.dismissed);
  const upcoming = visible.filter(r => !r.dismissed && daysUntil(r.nextPredicted) <= 30 && daysUntil(r.nextPredicted) >= -7);
  const expenses = visible.filter(r => r.type === "expense" && !upcoming.includes(r));
  const income = visible.filter(r => r.type === "income" && !upcoming.includes(r));

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-100">Recurring Transactions</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} className="accent-blue-500" />
            Show dismissed
          </label>
          <button
            onClick={detect}
            disabled={detecting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {detecting ? "Detecting…" : "Re-detect"}
          </button>
        </div>
      </div>

      <main className="flex flex-col gap-6 px-8 py-6">
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <p className="text-sm text-zinc-400">No recurring transactions detected yet.</p>
            <p className="text-xs text-zinc-600 mt-1">Run analysis on at least 2 months of data, then click Re-detect.</p>
            <button onClick={detect} disabled={detecting} className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
              {detecting ? "Detecting…" : "Detect now"}
            </button>
          </div>
        ) : (
          <>
            {/* Upcoming in next 30 days */}
            {upcoming.length > 0 && (
              <Section title="Upcoming (next 30 days)" accent="amber">
                {upcoming.map(r => <RecurringRow key={r.id} item={r} onPatch={patch} highlight />)}
              </Section>
            )}

            {/* Recurring expenses */}
            {expenses.length > 0 && (
              <Section title="Recurring Expenses">
                {expenses.map(r => <RecurringRow key={r.id} item={r} onPatch={patch} />)}
              </Section>
            )}

            {/* Recurring income */}
            {income.length > 0 && (
              <Section title="Recurring Income" accent="green">
                {income.map(r => <RecurringRow key={r.id} item={r} onPatch={patch} />)}
              </Section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent?: "amber" | "green"; children: React.ReactNode }) {
  const color = accent === "amber" ? "text-amber-400" : accent === "green" ? "text-green-400" : "text-zinc-400";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="border-b border-zinc-800 px-6 py-3.5">
        <h2 className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</h2>
      </div>
      <ul className="divide-y divide-zinc-800">{children}</ul>
    </div>
  );
}

function RecurringRow({ item: r, onPatch, highlight }: { item: RecurringItem; onPatch: (id: string, u: { confirmed?: boolean; dismissed?: boolean }) => void; highlight?: boolean }) {
  const days = daysUntil(r.nextPredicted);
  const overdue = days < 0;
  const soon = days <= 7;

  return (
    <li className={`flex items-center gap-4 px-6 py-4 ${highlight ? "bg-amber-950/10" : ""} ${r.dismissed ? "opacity-40" : ""}`}>
      {/* Type indicator */}
      <div className={`h-2 w-2 flex-shrink-0 rounded-full ${r.type === "income" ? "bg-green-500" : "bg-red-500"}`} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-zinc-100">{r.displayName}</span>
          {r.confirmed && <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-900/50 text-blue-400 uppercase tracking-wide">Confirmed</span>}
          {confidenceBadge(r.confidence)}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
          <span>{r.category}</span>
          <span>·</span>
          <span>{freqLabel(r.frequency)}</span>
          <span>·</span>
          <span>{r.occurrences.length}× seen</span>
          <span>·</span>
          <span>Last: {r.lastSeen}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        {r.amountMin !== r.amountMax ? (
          <>
            <p className={`tabular-nums font-semibold text-sm ${r.type === "income" ? "text-green-400" : "text-zinc-100"}`}>
              {r.type === "income" ? "+" : ""}~{CAD.format(r.amount)}
            </p>
            <p className="text-xs text-zinc-500 tabular-nums">
              {r.type === "income" ? "+" : ""}{CAD.format(r.amountMin)} – {r.type === "income" ? "+" : ""}{CAD.format(r.amountMax)}
            </p>
          </>
        ) : (
          <p className={`tabular-nums font-semibold text-sm ${r.type === "income" ? "text-green-400" : "text-zinc-100"}`}>
            {r.type === "income" ? "+" : ""}{CAD.format(r.amount)}
          </p>
        )}
      </div>

      {/* Next predicted */}
      <div className="text-right flex-shrink-0 w-28">
        <p className={`text-sm font-medium tabular-nums ${overdue ? "text-red-400" : soon ? "text-amber-400" : "text-zinc-300"}`}>
          {overdue ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `in ${days}d`}
        </p>
        <p className="text-[11px] text-zinc-600">{r.nextPredicted}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!r.confirmed && !r.dismissed && (
          <button
            onClick={() => onPatch(r.id, { confirmed: true })}
            className="rounded px-2 py-1 text-xs text-blue-400 border border-blue-800 hover:bg-blue-900/30 transition-colors"
          >
            Confirm
          </button>
        )}
        {r.confirmed && (
          <button
            onClick={() => onPatch(r.id, { confirmed: false })}
            className="rounded px-2 py-1 text-xs text-zinc-500 border border-zinc-700 hover:bg-zinc-800 transition-colors"
          >
            Unconfirm
          </button>
        )}
        <button
          onClick={() => onPatch(r.id, { dismissed: !r.dismissed })}
          className="rounded px-2 py-1 text-xs text-zinc-500 border border-zinc-700 hover:bg-zinc-800 transition-colors"
        >
          {r.dismissed ? "Restore" : "Dismiss"}
        </button>
      </div>
    </li>
  );
}
