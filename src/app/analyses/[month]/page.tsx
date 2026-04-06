"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AnalysisSummary from "@/components/AnalysisSummary";
import ModelPicker from "@/components/ModelPicker";
import type { SavedAnalysis, SavedTransaction, MonthInsights } from "@/lib/analysis-storage";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const CAD2 = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CATEGORIES = [
  "Groceries", "Dining", "Coffee", "Gas", "Transit",
  "Subscriptions", "Shopping", "Healthcare", "Entertainment",
  "Travel", "Utilities", "Fees", "Donations", "Investments", "Other",
];

const NECESSITIES = ["Must", "Essential", "Good to Have", "Optional", "Non-Essential"];

type NecessityLevel = "Must" | "Essential" | "Good to Have" | "Optional" | "Non-Essential";

function necessityBadgeClass(necessity: string): string {
  switch (necessity as NecessityLevel) {
    case "Must":
      return "bg-zinc-800 text-zinc-300";
    case "Essential":
      return "bg-blue-950/70 text-blue-300";
    case "Good to Have":
      return "bg-yellow-950/70 text-yellow-300";
    case "Optional":
      return "bg-orange-950/70 text-orange-300";
    case "Non-Essential":
      return "bg-red-950/70 text-red-300";
    default:
      return "bg-zinc-800 text-zinc-400";
  }
}

function InsightsPanel({ insights }: { insights: MonthInsights }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h2 className="text-sm font-semibold text-zinc-300">Spending Insights</h2>
        <p className="text-xs text-zinc-500 mt-0.5">AI-generated analysis of your spending patterns</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
        <div className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <span className="h-5 w-5 rounded bg-blue-950/60 flex items-center justify-center text-blue-400 text-[10px]">●</span>
            Observations
          </h3>
          <ul className="flex flex-col gap-2">
            {insights.observations.map((obs, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="mt-0.5 flex-shrink-0 text-zinc-600">•</span>
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <span className="h-5 w-5 rounded bg-amber-950/60 flex items-center justify-center text-amber-400 text-[10px]">→</span>
            Recommendations
          </h3>
          <ul className="flex flex-col gap-2">
            {insights.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="mt-0.5 flex-shrink-0 text-amber-500">→</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <span className="h-5 w-5 rounded bg-green-950/60 flex items-center justify-center text-green-400 text-[10px]">$</span>
            Savings Opportunities
          </h3>
          <ul className="flex flex-col gap-2">
            {insights.savings.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-300">
                <span className="mt-0.5 flex-shrink-0 text-green-500">$</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="mt-6 mb-2 text-base font-semibold text-zinc-100 first:mt-0">{line.slice(3)}</h2>);
      i++;
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="mt-4 mb-1 text-sm font-semibold text-zinc-300">{line.slice(4)}</h3>);
      i++;
    } else if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      elements.push(
        <ul key={i} className="my-2 flex flex-col gap-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm text-zinc-300">
              <span className="mt-0.5 flex-shrink-0 text-zinc-500">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      elements.push(<p key={i} className="my-2 text-sm leading-relaxed text-zinc-300">{line}</p>);
      i++;
    }
  }
  return <>{elements}</>;
}

const CAD_BALANCE = new Intl.NumberFormat("en-CA", {
  style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

function BalanceChart({ transactions }: { transactions: SavedTransaction[] }) {
  const points = transactions
    .filter(t => t.balance != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => ({
      date: t.date.slice(5),   // MM-DD
      balance: t.balance!,
      label: t.cleanDescription ?? t.description,
    }));

  if (points.length === 0) return null;

  const minBalance = Math.min(...points.map(p => p.balance));
  const maxBalance = Math.max(...points.map(p => p.balance));
  const isLow = minBalance < 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-300">Running Balance</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{points.length} data points from bank export</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <p className="text-xs text-zinc-500">Low</p>
            <p className={`tabular-nums text-sm font-semibold ${isLow ? "text-red-400" : "text-zinc-300"}`}>
              {CAD_BALANCE.format(minBalance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">High</p>
            <p className="tabular-nums text-sm font-semibold text-zinc-300">{CAD_BALANCE.format(maxBalance)}</p>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={points} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
          />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#a1a1aa" }}
            formatter={(v) => [CAD_BALANCE.format(Number(v ?? 0)), "Balance"]}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#balGrad)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: "#3b82f6" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MonthAnalysisPage() {
  const params = useParams();
  const month = params.month as string;

  const [analysis, setAnalysis] = useState<SavedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [generatingInsights, setGeneratingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editingNecessityId, setEditingNecessityId] = useState<string | null>(null);
  const [savingTxnId, setSavingTxnId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [necessityFilter, setNecessityFilter] = useState<string>("All");
  const [txnTab, setTxnTab] = useState<"spending" | "income" | "transfers">("spending");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState("");
  const [selectedModel, setSelectedModel] = useState("local:gemma4:e2b");

  useEffect(() => {
    if (!month) return;
    fetch(`/api/analyses/${month}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((data: SavedAnalysis) => { setAnalysis(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
    fetch("/api/config")
      .then(r => r.json())
      .then((cfg: { selectedModel?: string }) => { if (cfg.selectedModel) setSelectedModel(cfg.selectedModel); })
      .catch(() => {});
  }, [month]);

  const generateInsights = useCallback(async () => {
    setGeneratingInsights(true);
    setInsightsError("");
    try {
      const res = await fetch(`/api/analyses/${month}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAnalysis(prev => prev ? { ...prev, insights: data.insights } : prev);
    } catch (e) {
      setInsightsError(e instanceof Error ? e.message : "Failed to generate insights");
    } finally {
      setGeneratingInsights(false);
    }
  }, [month]);

  const updateTxn = useCallback(async (
    txn: SavedTransaction,
    patch: Partial<Pick<SavedTransaction, "category" | "necessity" | "isTransfer" | "type">>
  ) => {
    setSavingTxnId(txn.id);
    setEditingTxnId(null);
    setEditingNecessityId(null);
    try {
      const body: Record<string, unknown> = { ...patch };
      if (patch.category !== undefined) body.merchantKey = txn.merchantKey;
      await fetch(`/api/analyses/${month}/transactions/${txn.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setAnalysis((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === txn.id ? { ...t, ...patch, userTagged: true } : t
          ),
        };
      });
    } catch (e) {
      console.error("Failed to update transaction:", e);
    } finally {
      setSavingTxnId(null);
    }
  }, [month]);

  const reanalyze = useCallback(async () => {
    setReanalyzing(true);
    setReanalyzeError("");
    try {
      const res = await fetch(`/api/analyses/${month}/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setAnalysis(prev => prev ? { ...prev, insights: data.insights } : prev);
    } catch (e) {
      setReanalyzeError(e instanceof Error ? e.message : "Failed to regenerate insights");
    } finally {
      setReanalyzing(false);
    }
  }, [month]);

  // Navigation: prev/next months
  const [year, monthNum] = month ? month.split("-").map(Number) : [0, 0];
  const prevMonth = monthNum === 1
    ? `${year - 1}-12`
    : `${year}-${String(monthNum - 1).padStart(2, "0")}`;
  const nextMonth = monthNum === 12
    ? `${year + 1}-01`
    : `${year}-${String(monthNum + 1).padStart(2, "0")}`;
  const now = new Date();
  const isNextFuture =
    year * 12 + monthNum >= now.getFullYear() * 12 + now.getMonth() + 1;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <header className="border-b border-zinc-800 bg-zinc-950 px-8 py-4">
          <div className="w-full">
            <div className="h-5 w-32 rounded bg-zinc-800 animate-pulse" />
          </div>
        </header>
        <main className="w-full px-6 py-8 flex flex-col gap-6 animate-pulse">
          <div className="h-28 rounded-xl bg-zinc-800" />
          <div className="grid grid-cols-2 gap-6">
            <div className="h-64 rounded-xl bg-zinc-800" />
            <div className="h-64 rounded-xl bg-zinc-800" />
          </div>
        </main>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <header className="border-b border-zinc-800 bg-zinc-950 px-8 py-4">
          <div className="w-full">
            <Link href="/analyses" className="text-xs text-zinc-400 hover:text-zinc-300">← Analyses</Link>
          </div>
        </header>
        <main className="w-full px-6 py-8">
          <div className="rounded-xl border border-red-800 bg-red-950/50 px-6 py-5">
            <p className="font-medium text-red-300">Analysis not found</p>
            <p className="mt-1 text-sm text-red-300/70">{error || "No analysis saved for this month."}</p>
          </div>
        </main>
      </div>
    );
  }

  const spendingTxns = analysis.transactions.filter(t => !t.isTransfer && t.type !== "credit");
  const incomeTxns = analysis.transactions.filter(t => !t.isTransfer && t.type === "credit");
  const transferTxns = analysis.transactions.filter(t => t.isTransfer);
  const activeTxns = txnTab === "spending" ? spendingTxns : txnTab === "income" ? incomeTxns : transferTxns;

  const filteredTxns = activeTxns
    .filter(t => categoryFilter === "All" || t.category === categoryFilter)
    .filter(t => necessityFilter === "All" || t.necessity === necessityFilter);

  const categoriesInData = ["All", ...Array.from(new Set(activeTxns.map((t) => t.category))).sort()];
  const necessitiesInData = ["All", "Must", "Essential", "Good to Have", "Optional", "Non-Essential"].filter(
    n => n === "All" || activeTxns.some(t => t.necessity === n)
  );
  const lowConfidenceCount = spendingTxns.filter((t) => t.confidence === "low" && !t.userTagged).length;

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between gap-4">
        <h1 className="text-sm font-semibold text-zinc-100">{analysis.period}</h1>
        <ModelPicker
          value={selectedModel}
          onChange={model => {
            setSelectedModel(model);
            fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedModel: model }) }).catch(() => {});
          }}
        />
        <div className="flex items-center gap-2 ml-auto">
          <Link href={`/analyses/${prevMonth}`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800">
            ← Prev
          </Link>
          {!isNextFuture && (
            <Link href={`/analyses/${nextMonth}`} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800">
              Next →
            </Link>
          )}
          <button
            onClick={reanalyze}
            disabled={reanalyzing}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {reanalyzing ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
                Regenerating…
              </span>
            ) : "Regen Insights"}
          </button>
        </div>
      </div>
      {reanalyzeError && (
        <div className="px-8 py-2 text-xs text-red-400 bg-red-950/30 border-b border-red-900/40">
          Reanalysis failed: {reanalyzeError}
        </div>
      )}

      <main className="w-full px-8 py-6 flex flex-col gap-8">
        {/* Summary cards */}
        <AnalysisSummary data={analysis} />

        {/* Running balance chart (only shown if balance data exists) */}
        <BalanceChart transactions={analysis.transactions} />

        {/* Insights */}
        {analysis.insights ? (
          <InsightsPanel insights={analysis.insights} />
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-300">No insights yet</p>
              <p className="mt-0.5 text-xs text-zinc-500">Generate AI observations, recommendations and savings opportunities for this month.</p>
              {insightsError && <p className="mt-1 text-xs text-red-400">{insightsError}</p>}
            </div>
            <button
              onClick={generateInsights}
              disabled={generatingInsights}
              className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generatingInsights ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Generating…
                </>
              ) : "Generate Insights"}
            </button>
          </div>
        )}

        {/* Narrative */}
        {analysis.narrative && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-6 shadow-zinc-900">
            <h2 className="mb-4 text-sm font-semibold text-zinc-400">Detailed analysis</h2>
            <Markdown text={analysis.narrative} />
          </div>
        )}

        {/* Transaction table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 shadow-zinc-900 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setTxnTab("spending"); setCategoryFilter("All"); setNecessityFilter("All"); }}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${txnTab === "spending" ? "bg-red-950/60 text-red-300" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Spending
                <span className="ml-2 text-xs opacity-70">{spendingTxns.length}</span>
              </button>
              <button
                onClick={() => { setTxnTab("income"); setCategoryFilter("All"); setNecessityFilter("All"); }}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${txnTab === "income" ? "bg-green-950/60 text-green-300" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Income
                <span className="ml-2 text-xs opacity-70">{incomeTxns.length}</span>
              </button>
              <button
                onClick={() => { setTxnTab("transfers"); setCategoryFilter("All"); setNecessityFilter("All"); }}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${txnTab === "transfers" ? "bg-zinc-700/60 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                Excluded
                <span className="ml-2 text-xs opacity-70">{transferTxns.length}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {txnTab === "spending" && lowConfidenceCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-950/50 px-2.5 py-1 text-xs font-medium text-amber-300">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {lowConfidenceCount} need review
                </span>
              )}
              {txnTab !== "transfers" && (
                <>
                  <select
                    value={necessityFilter}
                    onChange={(e) => setNecessityFilter(e.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {necessitiesInData.map((n) => (
                      <option key={n} value={n}>{n === "All" ? "All Necessity" : n}</option>
                    ))}
                  </select>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {categoriesInData.map((c) => (
                      <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          {txnTab === "transfers" ? (
            /* Excluded/Transfers tab — simple list with Include button */
            <div className="overflow-x-auto">
              {transferTxns.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-zinc-500">No excluded transactions.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide w-28">Include</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {transferTxns.map((txn) => (
                      <tr key={txn.id} className="opacity-70 hover:opacity-100 transition-opacity">
                        <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{txn.date}</td>
                        <td className="px-4 py-3 max-w-xs">
                          <span className="block truncate text-zinc-300">{txn.cleanDescription ?? txn.description}</span>
                          {txn.cleanDescription && txn.cleanDescription !== txn.description && (
                            <span className="block truncate text-[11px] text-zinc-500">{txn.description}</span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap ${txn.type === "credit" ? "text-green-400" : "text-zinc-300"}`}>
                          {txn.type === "credit" ? "+" : ""}{CAD2.format(txn.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-zinc-800 text-zinc-400">
                            {txn.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {savingTxnId === txn.id ? (
                            <span className="text-xs text-zinc-500">Saving…</span>
                          ) : (
                            <button
                              onClick={() => updateTxn(txn, { isTransfer: false })}
                              className="rounded-md border border-zinc-600 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                              title="Include in spending/income totals"
                            >
                              Include
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            /* Spending / Income tabs */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Category</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">Necessity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide w-20">Exclude</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredTxns.map((txn) => (
                    <tr
                      key={txn.id}
                      className={
                        txn.confidence === "low" && !txn.userTagged
                          ? "bg-amber-950/20"
                          : ""
                      }
                    >
                      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                        {txn.date}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="block truncate text-zinc-200">
                          {txn.cleanDescription ?? txn.description}
                        </span>
                        {txn.cleanDescription && txn.cleanDescription !== txn.description && (
                          <span className="block truncate text-[11px] text-zinc-500">{txn.description}</span>
                        )}
                        {txn.confidence === "low" && !txn.userTagged && (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" title="Category uncertain" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <button
                          onClick={() => updateTxn(txn, { type: txn.type === "credit" ? "debit" : "credit" })}
                          className={`font-medium hover:opacity-70 transition-opacity ${txn.type === "credit" ? "text-green-400" : "text-zinc-100"}`}
                          title="Click to flip income / spending"
                        >
                          {txn.type === "credit" ? "+" : ""}{CAD2.format(txn.amount)}
                        </button>
                      </td>
                      {/* Category cell */}
                      <td className="px-4 py-3">
                        {editingTxnId === txn.id ? (
                          <select
                            autoFocus
                            defaultValue={txn.category}
                            onBlur={() => setEditingTxnId(null)}
                            onChange={(e) => updateTxn(txn, { category: e.target.value })}
                            className="rounded-md border border-blue-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : savingTxnId === txn.id ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
                            Saving…
                          </span>
                        ) : (
                          <button
                            onClick={() => setEditingTxnId(txn.id)}
                            className={[
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium hover:ring-1 hover:ring-blue-500 transition-all",
                              txn.userTagged
                                ? "bg-green-950/50 text-green-300"
                                : txn.confidence === "low"
                                ? "bg-amber-950/50 text-amber-300"
                                : "bg-zinc-800 text-zinc-400",
                            ].join(" ")}
                            title="Click to change category"
                          >
                            {txn.category}
                          </button>
                        )}
                      </td>
                      {/* Necessity cell */}
                      <td className="px-4 py-3">
                        {editingNecessityId === txn.id ? (
                          <select
                            autoFocus
                            defaultValue={txn.necessity}
                            onBlur={() => setEditingNecessityId(null)}
                            onChange={(e) => updateTxn(txn, { necessity: e.target.value })}
                            className="rounded-md border border-blue-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {NECESSITIES.map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        ) : txn.necessity ? (
                          <button
                            onClick={() => setEditingNecessityId(txn.id)}
                            className={[
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium hover:ring-1 hover:ring-blue-500 transition-all",
                              necessityBadgeClass(txn.necessity),
                            ].join(" ")}
                            title="Click to change necessity"
                          >
                            {txn.necessity}
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>
                      {/* Exclude/transfer toggle */}
                      <td className="px-4 py-3">
                        {savingTxnId === txn.id ? null : (
                          <button
                            onClick={() => updateTxn(txn, { isTransfer: true })}
                            className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition-colors"
                            title="Exclude from totals (mark as transfer)"
                          >
                            ⇄
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTxns.length === 0 && (
                <div className="px-6 py-8 text-center text-sm text-zinc-500">
                  No transactions in this category.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pb-8 text-center text-xs text-zinc-500">
          Generated {new Date(analysis.generatedAt).toLocaleDateString("en-CA", {
            year: "numeric", month: "long", day: "numeric",
          })} · {analysis.statementIds.length} statement{analysis.statementIds.length !== 1 ? "s" : ""}
        </div>
      </main>
    </div>
  );
}
