"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from "recharts";

interface Props {
  monthlyData: { month: string; amount: number; income: number; label: string }[];
  allCategories: { name: string; amount: number; percentage: number }[];
  allMerchants: { name: string; amount: number; visits: number; category?: string }[];
  categoryMonthlyData?: Record<string, string | number>[];
  topCategoryNames?: string[];
  balanceData?: { date: string; balance: number; label: string }[];
  totalSpend: number;
  monthCount: number;
}

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const CATEGORY_COLORS = [
  "#3b82f6", "#f59e0b", "#8b5cf6", "#10b981", "#f43f5e", "#06b6d4",
  "#f97316", "#84cc16", "#ec4899", "#14b8a6", "#a78bfa", "#fb923c",
  "#22d3ee", "#4ade80", "#e879f9", "#fbbf24",
];

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 shadow-lg min-w-[140px]">
      <p className="mb-1.5 text-xs text-zinc-400">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <span className="text-xs" style={{ color: p.color }}>{p.name}</span>
          <span className="text-sm font-semibold text-zinc-100">{CAD.format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Clickable legend for toggling category lines
function ToggleLegend({
  categories,
  hidden,
  colors,
  onToggle,
}: {
  categories: string[];
  hidden: Set<string>;
  colors: string[];
  onToggle: (cat: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
      {categories.map((cat, i) => {
        const isHidden = hidden.has(cat);
        return (
          <button
            key={cat}
            onClick={() => onToggle(cat)}
            className="flex items-center gap-1.5 text-xs transition-opacity"
            style={{ opacity: isHidden ? 0.35 : 1 }}
          >
            <span
              className="inline-block h-2 w-5 rounded-full"
              style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }}
            />
            <span className="text-zinc-400">{cat}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function SpendingCharts({
  monthlyData,
  allCategories,
  allMerchants,
  categoryMonthlyData,
  topCategoryNames,
  balanceData,
}: Props) {
  const maxCategory = Math.max(...allCategories.map((c) => c.amount), 1);
  const hasIncome = monthlyData.some(d => d.income > 0);
  const [merchantCategoryFilter, setMerchantCategoryFilter] = useState("All");
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());

  // Trim leading months with no data
  const firstDataIdx = monthlyData.findIndex(m => m.amount > 0 || m.income > 0);
  const displayMonthlyData = firstDataIdx > 0 ? monthlyData.slice(firstDataIdx) : monthlyData;

  const trimmedCategoryData = categoryMonthlyData && firstDataIdx > 0
    ? categoryMonthlyData.slice(firstDataIdx)
    : categoryMonthlyData;

  // Unique categories in merchants for the filter dropdown
  const merchantCategories = ["All", ...Array.from(new Set(
    allMerchants.map(m => m.category).filter(Boolean) as string[]
  )).sort()];

  const filteredMerchants = merchantCategoryFilter === "All"
    ? allMerchants
    : allMerchants.filter(m => m.category === merchantCategoryFilter);

  const hasCategoryTrend = trimmedCategoryData && topCategoryNames && topCategoryNames.length > 0 &&
    trimmedCategoryData.some(d => topCategoryNames.some(c => (d[c] as number) > 0));

  const toggleCategory = (cat: string) => {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Dynamic Y-axis max based on visible categories only
  const categoryYMax = useMemo(() => {
    if (!trimmedCategoryData || !topCategoryNames) return 1000;
    const visibleCats = topCategoryNames.filter(c => !hiddenCategories.has(c));
    if (visibleCats.length === 0) return 100;
    const max = Math.max(...trimmedCategoryData.flatMap(d =>
      visibleCats.map(c => (d[c] as number) ?? 0)
    ));
    if (max <= 0) return 100;
    // Round up to nearest nice increment relative to magnitude
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil((max * 1.1) / magnitude) * magnitude;
  }, [trimmedCategoryData, topCategoryNames, hiddenCategories]);

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Income vs Spend + Categories */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Income vs Spend chart */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5 flex flex-col">
          <h2 className="mb-4 text-sm font-semibold text-zinc-400 uppercase tracking-wide flex-shrink-0">
            {hasIncome ? "Income vs Spending" : "Monthly Spend Trend"}
          </h2>
          {displayMonthlyData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
              No data yet
            </div>
          ) : (
            <div className="flex-1 min-h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={displayMonthlyData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                  width={42}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                {hasIncome && <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa", paddingTop: 8 }} />}
                {displayMonthlyData.length > 6 && (
                  <Brush
                    dataKey="month"
                    height={20}
                    stroke="#3f3f46"
                    fill="#18181b"
                    travellerWidth={6}
                    style={{ fontSize: 10 }}
                  />
                )}
                <Bar dataKey="amount" name="Spending" fill="#ef4444" radius={[3, 3, 0, 0]} />
                {hasIncome && (
                  <Line
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ fill: "#22c55e", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* All categories */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Spending by Category <span className="normal-case font-normal text-zinc-600">(all time)</span>
          </h2>
          {allCategories.length === 0 ? (
            <p className="text-sm text-zinc-500">No data yet</p>
          ) : (
            <ul className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1">
              {allCategories.map((cat) => (
                <li key={cat.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{cat.name}</span>
                    <span className="tabular-nums text-sm font-medium text-zinc-100">
                      {CAD.format(cat.amount)}
                      <span className="ml-1.5 text-xs text-zinc-500">{cat.percentage}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min((cat.amount / maxCategory) * 100, 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Row 2: Category spending trend */}
      {hasCategoryTrend && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Spending by Category <span className="normal-case font-normal text-zinc-600">(monthly trend — click legend to toggle)</span>
            </h2>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart key={categoryYMax} data={trimmedCategoryData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                width={42}
                domain={[0, categoryYMax]}
                allowDataOverflow={true}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.08)" }} />
              {(trimmedCategoryData?.length ?? 0) > 6 && (
                <Brush
                  dataKey="month"
                  height={20}
                  stroke="#3f3f46"
                  fill="#18181b"
                  travellerWidth={6}
                  style={{ fontSize: 10 }}
                />
              )}
              {topCategoryNames!.map((cat, i) => (
                <Line
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stroke={hiddenCategories.has(cat) ? "transparent" : CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={hiddenCategories.has(cat) ? false : { r: 3, strokeWidth: 0 }}
                  legendType="none"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          {topCategoryNames && (
            <ToggleLegend
              categories={topCategoryNames}
              hidden={hiddenCategories}
              colors={CATEGORY_COLORS}
              onToggle={toggleCategory}
            />
          )}
        </div>
      )}

      {/* Row 3: Running balance */}
      {balanceData && balanceData.length > 1 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
              Running Balance <span className="normal-case font-normal text-zinc-600">(chequing account)</span>
            </h2>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-xs text-zinc-600">Low</p>
                <p className={`tabular-nums text-sm font-semibold ${Math.min(...balanceData.map(d => d.balance)) < 0 ? "text-red-400" : "text-zinc-300"}`}>
                  {CAD.format(Math.min(...balanceData.map(d => d.balance)))}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-600">High</p>
                <p className="tabular-nums text-sm font-semibold text-zinc-300">
                  {CAD.format(Math.max(...balanceData.map(d => d.balance)))}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-600">Latest</p>
                <p className="tabular-nums text-sm font-semibold text-blue-300">
                  {CAD.format(balanceData[balanceData.length - 1].balance)}
                </p>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={balanceData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="balGradHome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
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
                formatter={(v) => [new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 }).format(Number(v ?? 0)), "Balance"]}
              />
              {balanceData.length > 60 && (
                <Brush dataKey="label" height={20} stroke="#3f3f46" fill="#18181b" travellerWidth={6} style={{ fontSize: 10 }} />
              )}
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#balGradHome)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Row 4: Top merchants with category filter */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
            Top Merchants <span className="normal-case font-normal text-zinc-600">(all time)</span>
          </h2>
          {merchantCategories.length > 2 && (
            <select
              value={merchantCategoryFilter}
              onChange={e => setMerchantCategoryFilter(e.target.value)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {merchantCategories.map(c => (
                <option key={c} value={c}>{c === "All" ? "All Categories" : c}</option>
              ))}
            </select>
          )}
        </div>
        {filteredMerchants.length === 0 ? (
          <p className="text-sm text-zinc-500">No merchants</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {filteredMerchants.map((m, i) => {
              const avg = m.visits > 1 ? m.amount / m.visits : null;
              return (
                <li key={m.name + i} className="flex items-center justify-between gap-2 py-2.5 first:pt-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 flex-shrink-0 text-center text-xs tabular-nums text-zinc-600">{i + 1}</span>
                    <div className="min-w-0">
                      <span className="block truncate text-sm text-zinc-300">{m.name}</span>
                      {m.category && (
                        <span className="text-[11px] text-zinc-600">{m.category}</span>
                      )}
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
        )}
      </div>
    </div>
  );
}
