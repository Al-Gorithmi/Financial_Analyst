"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import SpendingCharts from "./SpendingCharts";
import type { RecurringItem } from "@/lib/recurring";

const CAD_CENTS = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export type MonthDataPoint = {
  month: string;
  period: string;
  totalSpend: number;
  totalIncome: number;
  investmentTotal: number;
  categories: { name: string; amount: number }[];
  merchants: { name: string; amount: number; visits: number; category: string }[];
  balancePoints: { date: string; balance: number }[];
};

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-CA", { month: "short", year: "numeric" });
}

export default function HomeClient({ allMonthData, upcomingItems }: { allMonthData: MonthDataPoint[]; upcomingItems: RecurringItem[] }) {
  const sorted = useMemo(() => [...allMonthData].sort((a, b) => a.month.localeCompare(b.month)), [allMonthData]);
  const months = sorted.map(d => d.month);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");

  const filteredData = useMemo(() =>
    sorted.filter(d => (!fromMonth || d.month >= fromMonth) && (!toMonth || d.month <= toMonth)),
    [sorted, fromMonth, toMonth]);

  const monthlyData = useMemo(() =>
    filteredData.map(d => {
      const [y, mo] = d.month.split("-").map(Number);
      return {
        month: new Date(y, mo - 1, 1).toLocaleDateString("en-CA", { month: "short" }),
        amount: Math.max(0, d.totalSpend - d.investmentTotal),
        income: d.totalIncome,
        label: d.month,
      };
    }), [filteredData]);

  const allCategories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of filteredData)
      for (const c of d.categories.filter(c => c.name !== "Investments"))
        totals.set(c.name, (totals.get(c.name) ?? 0) + c.amount);
    const grand = [...totals.values()].reduce((s, v) => s + v, 0);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, percentage: grand > 0 ? Math.round((amount / grand) * 100) : 0 }));
  }, [filteredData]);

  const allMerchants = useMemo(() => {
    const map = new Map<string, { amount: number; visits: number; category: string }>();
    for (const d of filteredData)
      for (const m of d.merchants) {
        const ex = map.get(m.name);
        if (ex) map.set(m.name, { ...ex, amount: ex.amount + m.amount, visits: ex.visits + m.visits });
        else map.set(m.name, { amount: m.amount, visits: m.visits, category: m.category });
      }
    return [...map.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 20)
      .map(([name, v]) => ({ name, ...v }));
  }, [filteredData]);

  const topCategoryNames = useMemo(() => allCategories.map(c => c.name), [allCategories]);

  const categoryMonthlyData = useMemo(() =>
    filteredData.map(d => {
      const [y, mo] = d.month.split("-").map(Number);
      const point: Record<string, string | number> = {
        month: new Date(y, mo - 1, 1).toLocaleDateString("en-CA", { month: "short" }),
      };
      for (const cat of topCategoryNames)
        point[cat] = d.categories.find(c => c.name === cat)?.amount ?? 0;
      return point;
    }), [filteredData, topCategoryNames]);

  const balanceData = useMemo(() =>
    filteredData
      .flatMap(d => d.balancePoints.map(b => ({ ...b, label: b.date.slice(5) })))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [filteredData]);

  const totalSpend = filteredData.reduce((s, d) => s + d.totalSpend, 0);
  const monthCount = filteredData.length;
  const monthlyAvg = monthCount > 0 ? totalSpend / monthCount : 0;
  const latestFull = filteredData[filteredData.length - 1];
  const isFiltered = !!(fromMonth || toMonth);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-3.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Date range</span>
        <select
          value={fromMonth}
          onChange={e => setFromMonth(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All time</option>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <span className="text-zinc-600">→</span>
        <select
          value={toMonth}
          onChange={e => setToMonth(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Present</option>
          {months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        {isFiltered && (
          <button
            onClick={() => { setFromMonth(""); setToMonth(""); }}
            className="rounded px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:bg-zinc-800 transition-colors"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-500">
          {monthCount} month{monthCount !== 1 ? "s" : ""}{isFiltered ? " selected" : " total"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total Spend</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">
            {monthCount > 0 ? CAD.format(totalSpend) : "—"}
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">{isFiltered ? "filtered range" : "across all months"}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Monthly Average</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">
            {monthCount > 0 ? CAD.format(monthlyAvg) : "—"}
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">per month</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Months Tracked</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">{monthCount}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{isFiltered ? "in range" : "months saved"}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest Month</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100">
            {latestFull ? CAD.format(latestFull.totalSpend) : "—"}
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">{latestFull?.period ?? "no data"}</p>
        </div>
      </div>

      {/* Upcoming recurring payments/income */}
      {upcomingItems.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="border-b border-zinc-800 px-6 py-3.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-400">Upcoming (next 30 days)</h2>
            <Link href="/recurring" className="text-xs text-zinc-500 hover:text-zinc-300">View all →</Link>
          </div>
          <ul className="divide-y divide-zinc-800">
            {upcomingItems.map(r => {
              const days = Math.round((new Date(r.nextPredicted).getTime() - new Date().setHours(0,0,0,0)) / 86400000);
              const overdue = days < 0;
              return (
                <li key={r.id} className="flex items-center gap-4 px-6 py-3">
                  <div className={`h-2 w-2 flex-shrink-0 rounded-full ${r.type === "income" ? "bg-green-500" : "bg-red-500"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-200">{r.displayName}</span>
                    <span className="ml-2 text-xs text-zinc-500">{r.category} · {r.frequency}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold tabular-nums ${r.type === "income" ? "text-green-400" : "text-zinc-100"}`}>
                      {r.type === "income" ? "+" : ""}{r.amountMin !== r.amountMax ? "~" : ""}{CAD_CENTS.format(r.amount)}
                    </span>
                    {r.amountMin !== r.amountMax && (
                      <p className="text-[11px] text-zinc-500 tabular-nums">
                        {CAD_CENTS.format(r.amountMin)}–{CAD_CENTS.format(r.amountMax)}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-medium w-20 text-right ${overdue ? "text-red-400" : days <= 3 ? "text-amber-400" : "text-zinc-400"}`}>
                    {overdue ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `in ${days}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <SpendingCharts
        monthlyData={monthlyData}
        allCategories={allCategories}
        allMerchants={allMerchants}
        categoryMonthlyData={categoryMonthlyData}
        topCategoryNames={topCategoryNames}
        balanceData={balanceData}
        totalSpend={totalSpend}
        monthCount={monthCount}
      />
    </>
  );
}
