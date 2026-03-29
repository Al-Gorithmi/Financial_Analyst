export const dynamic = "force-dynamic";

import Link from "next/link";
import { listAnalyses, loadAnalysis } from "@/lib/analysis-storage";
import { loadRecurring, detectAndSaveRecurring } from "@/lib/recurring";
import HomeClient, { type MonthDataPoint } from "@/components/HomeClient";

export default async function Home() {
  let analyses: { month: string; generatedAt: string; totalSpend: number; totalIncome?: number; period: string }[] = [];
  try { analyses = await listAnalyses(); } catch { /* data dir may not exist yet */ }

  const latestGeneratedAt = analyses[0]?.generatedAt;
  const daysSinceLatest = latestGeneratedAt
    ? Math.floor((Date.now() - new Date(latestGeneratedAt).getTime()) / 86400000)
    : null;
  const isStale = daysSinceLatest !== null && daysSinceLatest > 35;

  const fullAnalyses = (await Promise.all(analyses.map(a => loadAnalysis(a.month)))).filter(Boolean);

  // Recurring
  let recurring = await loadRecurring();
  if (recurring.length === 0 && fullAnalyses.length >= 2) {
    try { recurring = await detectAndSaveRecurring(); } catch { /* non-fatal */ }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcomingItems = recurring.filter(r => {
    if (r.dismissed) return false;
    const days = Math.round((new Date(r.nextPredicted).getTime() - today.getTime()) / 86400000);
    return days >= -7 && days <= 30;
  });

  const latestFull = fullAnalyses[0] ?? null;

  // Per-month data for client
  const allMonthData: MonthDataPoint[] = fullAnalyses.map(a => {
    const investmentTotal = a!.transactions
      .filter(t => !t.isTransfer && t.category === "Investments")
      .reduce((s, t) => s + t.amount, 0);

    const mMap = new Map<string, { amount: number; visits: number; category: string }>();
    for (const t of a!.transactions.filter(t => !t.isTransfer && t.type !== "credit")) {
      const key = t.cleanDescription ?? t.merchantKey ?? t.description ?? "Unknown";
      const ex = mMap.get(key);
      if (ex) mMap.set(key, { ...ex, amount: ex.amount + t.amount, visits: ex.visits + 1 });
      else mMap.set(key, { amount: t.amount, visits: 1, category: t.category ?? "Other" });
    }
    const merchants = [...mMap.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 30)
      .map(([name, v]) => ({ name, ...v }));

    return {
      month: a!.month,
      period: a!.period,
      totalSpend: a!.totalSpend,
      totalIncome: a!.totalIncome ?? 0,
      investmentTotal,
      categories: a!.categories,
      merchants,
      balancePoints: a!.transactions.filter(t => t.balance != null).map(t => ({ date: t.date, balance: t.balance! })),
    };
  });

  return (
    <main className="flex w-full flex-col gap-6 px-8 py-6">
        {/* Stale warning */}
        {isStale && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3">
            <span className="text-amber-400 text-sm">⚠</span>
            <p className="flex-1 text-sm text-amber-300">
              Last analysis was <strong>{daysSinceLatest} days ago</strong> — upload your latest statement.
            </p>
            <Link href="/upload" className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500">
              Upload
            </Link>
          </div>
        )}

        {/* Filterable stats + charts + upcoming */}
        <HomeClient allMonthData={allMonthData} upcomingItems={upcomingItems} />

        {/* Latest month insights */}
        {latestFull?.insights && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="border-b border-zinc-800 px-6 py-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Insights — {latestFull.period}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Spending analysis and recommendations</p>
              </div>
              <Link href={`/analyses/${latestFull.month}`} className="text-xs text-blue-400 hover:text-blue-300">
                Full analysis →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
              {[
                { title: "Observations",         items: latestFull.insights.observations.slice(0, 3),    bullet: "•", bulletColor: "text-zinc-600" },
                { title: "Recommendations",      items: latestFull.insights.recommendations.slice(0, 3), bullet: "→", bulletColor: "text-amber-600" },
                { title: "Savings Opportunities",items: latestFull.insights.savings,                      bullet: "$", bulletColor: "text-green-600" },
              ].map(({ title, items, bullet, bulletColor }) => (
                <div key={title} className="px-6 py-5">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
                  <ul className="flex flex-col gap-2">
                    {items.map((item, i) => (
                      <li key={i} className="flex gap-2 text-sm text-zinc-400">
                        <span className={`mt-0.5 flex-shrink-0 ${bulletColor}`}>{bullet}</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
    </main>
  );
}
