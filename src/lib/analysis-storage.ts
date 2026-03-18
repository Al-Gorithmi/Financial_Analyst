import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const ANALYSES_DIR = path.join(process.cwd(), "data", "analyses");

export interface SavedTransaction {
  id: string;
  date: string;           // YYYY-MM-DD
  description: string;
  cleanDescription?: string; // LLM-cleaned readable merchant name
  amount: number;
  type: "debit" | "credit";
  category: string;
  confidence: "high" | "low";
  necessity: string;
  merchantKey: string;
  isTransfer: boolean;   // true = inter-account transfer, excluded from spend totals
  userTagged: boolean;
  balance?: number;       // running account balance after this transaction (from bank export)
}

export interface MonthInsights {
  observations: string[];
  recommendations: string[];
  savings: string[];
}

export interface SavedAnalysis {
  month: string;          // YYYY-MM (primary month)
  generatedAt: string;
  statementIds: string[];
  period: string;
  totalSpend: number;
  totalIncome?: number;
  categories: { name: string; amount: number; percentage: number }[];
  topMerchants: { name: string; amount: number; visits: number }[];
  monthlyTotals: { month: string; amount: number }[];
  anomalies: string[];
  transactions: SavedTransaction[];
  narrative?: string;
  insights?: MonthInsights;
}

async function ensureDir() {
  await fs.mkdir(ANALYSES_DIR, { recursive: true });
}

export async function saveAnalysis(analysis: SavedAnalysis): Promise<void> {
  await ensureDir();
  const file = path.join(ANALYSES_DIR, `${analysis.month}.json`);
  await fs.writeFile(file, JSON.stringify(analysis, null, 2), "utf-8");
}

export async function loadAnalysis(month: string): Promise<SavedAnalysis | null> {
  try {
    const file = path.join(ANALYSES_DIR, `${month}.json`);
    const text = await fs.readFile(file, "utf-8");
    return JSON.parse(text) as SavedAnalysis;
  } catch {
    return null;
  }
}

export async function listAnalyses(): Promise<
  Pick<SavedAnalysis, "month" | "period" | "totalSpend" | "totalIncome" | "generatedAt">[]
> {
  await ensureDir();
  const files = await fs.readdir(ANALYSES_DIR);
  const results: Pick<SavedAnalysis, "month" | "period" | "totalSpend" | "totalIncome" | "generatedAt">[] = [];

  for (const f of files.filter((f) => f.endsWith(".json"))) {
    const month = f.replace(".json", "");
    const analysis = await loadAnalysis(month);
    if (analysis) {
      results.push({
        month: analysis.month,
        period: analysis.period,
        totalSpend: analysis.totalSpend,
        totalIncome: analysis.totalIncome,
        generatedAt: analysis.generatedAt,
      });
    }
  }

  return results.sort((a, b) => b.month.localeCompare(a.month));
}

export function tagTransactionsWithMerchantKeys(
  transactions: Omit<SavedTransaction, "id" | "userTagged">[],
  knownTags: Record<string, string>
): SavedTransaction[] {
  return (transactions ?? []).map((t) => {
    const key = (t.merchantKey ?? t.description ?? "").toUpperCase().slice(0, 40);
    const category = knownTags[key] ?? t.category ?? "Other";
    const raw = t as { isTransfer?: boolean; type?: string };
    return {
      ...t,
      merchantKey: key,
      id: randomUUID(),
      category,
      type: (raw.type === "credit" ? "credit" : "debit") as "debit" | "credit",
      isTransfer: raw.isTransfer ?? false,
      userTagged: false,
    };
  });
}

export async function updateTransactionCategory(
  month: string,
  txnId: string,
  category: string
): Promise<boolean> {
  const analysis = await loadAnalysis(month);
  if (!analysis) return false;
  const txn = analysis.transactions.find((t) => t.id === txnId);
  if (!txn) return false;
  txn.category = category;
  txn.userTagged = true;

  // Recompute aggregates so home page and all consumers see fresh data
  const spendTxns = analysis.transactions.filter(t => !t.isTransfer && t.type !== "credit");
  const incomeTxns = analysis.transactions.filter(t => !t.isTransfer && t.type === "credit");
  analysis.totalSpend = spendTxns.reduce((s, t) => s + t.amount, 0);
  analysis.totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);
  const catMap = new Map<string, number>();
  for (const t of spendTxns) catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
  analysis.categories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({
      name,
      amount,
      percentage: analysis.totalSpend > 0 ? Math.round((amount / analysis.totalSpend) * 100) : 0,
    }));

  await saveAnalysis(analysis);

  // Also update SQLite so DB stays in sync
  try {
    const { getDb } = await import("./db");
    const db = getDb();
    db.prepare(`UPDATE transactions SET category = ?, userTagged = 1 WHERE id = ?`).run(category, txnId);
  } catch { /* non-fatal */ }

  return true;
}

export async function patchAnalysisNarrative(month: string, narrative: string): Promise<boolean> {
  const analysis = await loadAnalysis(month);
  if (!analysis) return false;
  analysis.narrative = narrative;
  await saveAnalysis(analysis);
  return true;
}
