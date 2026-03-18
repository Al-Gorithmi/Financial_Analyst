"use client";

import { useState } from "react";
import type { SavedAnalysis, SavedTransaction } from "@/lib/analysis-storage";

interface Props {
  data: SavedAnalysis;
}

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const CAD2 = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-sky-500", "bg-orange-500", "bg-teal-500",
  "bg-pink-500", "bg-lime-500", "bg-indigo-500", "bg-cyan-500",
];

function buildIncomeGroups(transactions: SavedTransaction[]) {
  const incomeTxns = transactions.filter(t => !t.isTransfer && t.type === "credit");
  const total = incomeTxns.reduce((s, t) => s + t.amount, 0);
  const byCategory = new Map<string, number>();
  for (const t of incomeTxns) {
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount);
  }
  const groups = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
    }));
  return { total, groups };
}

function buildMerchantsWithCategory(transactions: SavedTransaction[]) {
  const map = new Map<string, { amount: number; visits: number; displayName: string; category: string }>();
  for (const t of transactions.filter(t => !t.isTransfer && t.type !== "credit")) {
    const key = (t.merchantKey || t.description || "Unknown").slice(0, 30);
    const ex = map.get(key);
    if (ex) {
      map.set(key, { ...ex, amount: ex.amount + t.amount, visits: ex.visits + 1 });
    } else {
      map.set(key, { amount: t.amount, visits: 1, displayName: t.cleanDescription ?? t.description ?? key, category: t.category });
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 15)
    .map(([, v]) => v);
}

export default function AnalysisSummary({ data }: Props) {
  const { total: incomeTotal, groups: incomeGroups } = buildIncomeGroups(data.transactions);
  const totalIncome = data.totalIncome ?? incomeTotal;
  const hasIncome = totalIncome > 0;

  const merchantsWithCat = buildMerchantsWithCategory(data.transactions);
  const merchantCatOptions = ["All", ...Array.from(new Set(merchantsWithCat.map(m => m.category))).sort()];
  const [merchantCatFilter, setMerchantCatFilter] = useState("All");
  const filteredMerchants = merchantCatFilter === "All"
    ? merchantsWithCat
    : merchantsWithCat.filter(m => m.category === merchantCatFilter);

  const donationTxns = data.transactions.filter(t => !t.isTransfer && t.category === "Donations");
  const donationTotal = donationTxns.reduce((s, t) => s + t.amount, 0);
  const donationPct = totalIncome > 0 ? ((donationTotal / totalIncome) * 100).toFixed(1) : null;

  // Separate investments from regular spending
  const investmentTxns = data.transactions.filter(t => !t.isTransfer && t.category === "Investments");
  const investmentTotal = investmentTxns.reduce((s, t) => s + t.amount, 0);
  const regularSpend = data.totalSpend - investmentTotal;
  const netExclInvestments = totalIncome - regularSpend;
  const hasInvestments = investmentTotal > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Hero: income + investments + spend + net */}
      <div className={`grid grid-cols-1 gap-4 ${hasIncome ? (hasInvestments ? "sm:grid-cols-4" : "sm:grid-cols-3") : "sm:grid-cols-1"}`}>
        {/* Total Income */}
        {hasIncome && (
          <div className="rounded-xl border border-green-900/50 bg-green-950/20 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-green-600">Total Income</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-green-400">{CAD2.format(totalIncome)}</p>
            <p className="mt-0.5 text-sm text-green-700">{data.period}</p>
          </div>
        )}
        {/* Investments (Wealthsimple etc.) */}
        {hasIncome && hasInvestments && (
          <div className="rounded-xl border border-violet-900/50 bg-violet-950/20 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">Investments</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-violet-300">{CAD2.format(investmentTotal)}</p>
            <p className="mt-0.5 text-sm text-violet-700">
              {totalIncome > 0 ? `${((investmentTotal / totalIncome) * 100).toFixed(1)}% of income` : data.period}
            </p>
          </div>
        )}
        {/* Total Spend (excl. investments) */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {hasInvestments ? "Spending (excl. investments)" : "Total Spend"}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-100">{CAD2.format(hasInvestments ? regularSpend : data.totalSpend)}</p>
          <p className="mt-0.5 text-sm text-zinc-500">{data.period}</p>
        </div>
        {/* Net (excl. investments) */}
        {hasIncome && (
          <div className={`rounded-xl border px-6 py-5 ${netExclInvestments >= 0 ? "border-green-900/50 bg-green-950/20" : "border-red-900/50 bg-red-950/20"}`}>
            <p className={`text-xs font-semibold uppercase tracking-wide ${netExclInvestments >= 0 ? "text-green-600" : "text-red-600"}`}>
              Net{hasInvestments ? " (excl. investments)" : ""}
            </p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${netExclInvestments >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netExclInvestments >= 0 ? "+" : ""}{CAD2.format(netExclInvestments)}
            </p>
            <p className={`mt-0.5 text-sm ${netExclInvestments >= 0 ? "text-green-700" : "text-red-700"}`}>
              {netExclInvestments >= 0 ? "surplus" : "deficit"}
            </p>
          </div>
        )}
      </div>

      {/* Spending by category + Income sources */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Spending breakdown */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-400">Spending by category</h2>
          {data.categories.length === 0 ? (
            <p className="text-sm text-zinc-600">No spending data</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.categories.map((cat, i) => (
                <li key={cat.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{cat.name}</span>
                    <span className="tabular-nums text-sm font-medium text-zinc-100">
                      {CAD.format(cat.amount)}
                      <span className="ml-1.5 text-xs text-zinc-500">{cat.percentage.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                      style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Income sources (only when income exists) */}
        {hasIncome && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
            <h2 className="mb-4 text-sm font-semibold text-zinc-400">Income sources</h2>
            <ul className="flex flex-col gap-3">
              {incomeGroups.map((g, i) => (
                <li key={g.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{g.name}</span>
                    <span className="tabular-nums text-sm font-medium text-green-300">
                      {CAD.format(g.amount)}
                      <span className="ml-1.5 text-xs text-zinc-500">{g.percentage}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-green-500"
                      style={{ width: `${Math.min(g.percentage, 100)}%`, opacity: 0.7 + (i === 0 ? 0.3 : 0) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
              <span className="text-xs text-zinc-500">
                {data.transactions.filter(t => !t.isTransfer && t.type === "credit").length} income transactions
              </span>
              <span className="text-sm font-semibold text-green-400">{CAD2.format(totalIncome)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Top merchants with category filter */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-400">Top merchants</h2>
          {merchantCatOptions.length > 2 && (
            <select
              value={merchantCatFilter}
              onChange={e => setMerchantCatFilter(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {merchantCatOptions.map(c => (
                <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>
          )}
        </div>
        <ul className="divide-y divide-zinc-800">
          {filteredMerchants.map((m, i) => {
            const avg = m.visits > 1 ? m.amount / m.visits : null;
            return (
              <li key={m.displayName + i} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-zinc-600">{i + 1}</span>
                  <div className="min-w-0">
                    <span className="block truncate text-sm text-zinc-300">{m.displayName}</span>
                    <span className="text-[11px] text-zinc-600">{m.category}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className="tabular-nums text-sm font-medium text-zinc-100">{CAD.format(m.amount)}</span>
                  {avg !== null && (
                    <span className="ml-1.5 text-xs text-zinc-500">avg {CAD.format(avg)}</span>
                  )}
                  {m.visits > 1 && (
                    <span className="ml-1 text-xs text-zinc-600">×{m.visits}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Donations highlight */}
      {donationTotal > 0 && (
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-emerald-400">Donations</h2>
              <p className="mt-0.5 text-xs text-emerald-700">
                {donationTxns.length} transaction{donationTxns.length !== 1 ? "s" : ""} this month
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-emerald-300">{CAD2.format(donationTotal)}</p>
              {donationPct && (
                <p className="text-sm text-emerald-600">{donationPct}% of income</p>
              )}
            </div>
          </div>
          {donationTxns.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1.5 border-t border-emerald-900/40 pt-3">
              {donationTxns.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-emerald-300/80">{t.cleanDescription ?? t.description}</span>
                  <span className="tabular-nums font-medium text-emerald-300">{CAD2.format(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Anomalies */}
      {data.anomalies.length > 0 && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/50 px-6 py-5">
          <h2 className="mb-3 text-sm font-semibold text-amber-300">Items to review</h2>
          <ul className="flex flex-col gap-2">
            {data.anomalies.map((a, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-300/80">
                <span className="mt-0.5 flex-shrink-0 text-amber-400">⚠</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
