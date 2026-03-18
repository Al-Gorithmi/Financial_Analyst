"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AnalysisMeta {
  month: string;      // YYYY-MM
  period: string;
  totalSpend: number;
  generatedAt: string;
}

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AnalysesPage() {
  const [analyses, setAnalyses] = useState<AnalysisMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [statementIds, setStatementIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/analyses").then(r => r.json()).catch(() => []),
      fetch("/api/statements").then(r => r.json()).catch(() => ({ statements: [] })),
    ]).then(([analysesData, stmtsData]) => {
      setAnalyses(Array.isArray(analysesData) ? analysesData : []);
      const ids = (stmtsData.statements ?? []).map((s: { id: string }) => s.id);
      setStatementIds(ids);
      setLoading(false);
    });
  }, []);

  const analyseHref = statementIds.length > 0 ? `/analyse?ids=${statementIds.join(",")}` : "/upload";

  // Build a set of months that have analyses
  const analysedMonths = new Set(analyses.map((a) => a.month));

  // Determine stale warning
  const latestGeneratedAt = analyses[0]?.generatedAt;
  const daysSinceLatest = latestGeneratedAt
    ? Math.floor((Date.now() - new Date(latestGeneratedAt).getTime()) / 86400000)
    : null;
  const isStale = daysSinceLatest !== null && daysSinceLatest > 35;

  // Build calendar: current year + previous year
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear - 1];

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="border-b border-zinc-800 px-8 py-3.5 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-100">Analyses</h1>
        <div className="flex items-center gap-2">
          <Link href={analyseHref} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500">
            Analyse
          </Link>
          <Link href="/upload" className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
            + Upload new
          </Link>
        </div>
      </div>

      <main className="px-8 py-6 flex flex-col gap-6">
        {/* Stale warning */}
        {isStale && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-800 bg-amber-950/50 px-5 py-4">
            <span className="mt-0.5 text-lg">⚠️</span>
            <div>
              <p className="font-medium text-amber-300">Your analysis is {daysSinceLatest} days old</p>
              <p className="mt-0.5 text-sm text-amber-300/70">
                Upload your latest statement to keep your spending insights up to date.
              </p>
              <Link
                href="/upload"
                className="mt-2 inline-block text-sm font-medium text-amber-300 underline"
              >
                Upload statement →
              </Link>
            </div>
          </div>
        )}

        {/* No analyses yet */}
        {!loading && analyses.length === 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center shadow-zinc-900">
            <p className="text-zinc-400">No analyses yet.</p>
            <Link
              href="/upload"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Upload your first statement
            </Link>
          </div>
        )}

        {/* Recent analyses list */}
        {analyses.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-400">Recent analyses</h2>
            {analyses.slice(0, 12).map((a) => (
              <Link
                key={a.month}
                href={`/analyses/${a.month}`}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 shadow-zinc-900 hover:border-zinc-700 hover:bg-zinc-800 transition-all"
              >
                <div>
                  <p className="font-medium text-zinc-100">{a.period}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Saved {new Date(a.generatedAt).toLocaleDateString("en-CA", {
                      year: "numeric", month: "short", day: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-zinc-100 tabular-nums">{CAD.format(a.totalSpend)}</p>
                  <p className="text-xs text-zinc-500">total spend</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Year calendars */}
        {years.map((year) => (
          <div key={year}>
            <h2 className="mb-3 text-sm font-semibold text-zinc-400">{year}</h2>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-12">
              {MONTH_NAMES.map((name, idx) => {
                const monthKey = `${year}-${String(idx + 1).padStart(2, "0")}`;
                const hasData = analysedMonths.has(monthKey);
                const meta = analyses.find((a) => a.month === monthKey);
                // Don't show future months
                const isFuture =
                  year > now.getFullYear() ||
                  (year === now.getFullYear() && idx > now.getMonth());

                if (isFuture) {
                  return (
                    <div
                      key={monthKey}
                      className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-3 opacity-30"
                    >
                      <span className="text-xs font-medium text-zinc-500">{name}</span>
                    </div>
                  );
                }

                if (hasData && meta) {
                  return (
                    <Link
                      key={monthKey}
                      href={`/analyses/${monthKey}`}
                      className="flex flex-col items-center rounded-lg border border-blue-800 bg-blue-950/50 px-2 py-3 hover:bg-blue-950 transition-colors"
                      title={`${meta.period} — ${CAD.format(meta.totalSpend)}`}
                    >
                      <span className="text-xs font-semibold text-blue-300">{name}</span>
                      <span className="mt-1 text-[10px] tabular-nums text-blue-400">
                        {CAD.format(meta.totalSpend)}
                      </span>
                    </Link>
                  );
                }

                return (
                  <div
                    key={monthKey}
                    className="flex flex-col items-center rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-3"
                  >
                    <span className="text-xs text-zinc-500">{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
