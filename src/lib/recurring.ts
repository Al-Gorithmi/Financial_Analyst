import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { loadAnalysis, listAnalyses } from "./analysis-storage";
import type { SavedTransaction } from "./analysis-storage";

const RECURRING_FILE = path.join(process.cwd(), "data", "recurring.json");

export interface RecurringItem {
  id: string;
  merchantKey: string;
  displayName: string;
  category: string;
  necessity: string;
  type: "income" | "expense";
  frequency: "weekly" | "bi-weekly" | "monthly" | "quarterly" | "annual";
  frequencyDays: number;
  amount: number;
  amountMin: number;
  amountMax: number;
  lastSeen: string;       // YYYY-MM-DD
  nextPredicted: string;  // YYYY-MM-DD
  occurrences: { date: string; amount: number }[];
  confidence: "high" | "medium" | "low";
  confirmed?: boolean;
  dismissed?: boolean;
  detectedAt: string;
}

export async function loadRecurring(): Promise<RecurringItem[]> {
  try {
    return JSON.parse(await fs.readFile(RECURRING_FILE, "utf-8")) as RecurringItem[];
  } catch {
    return [];
  }
}

export async function saveRecurring(items: RecurringItem[]): Promise<void> {
  await fs.writeFile(RECURRING_FILE, JSON.stringify(items, null, 2), "utf-8");
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(nums: number[]): number { return nums.reduce((a, b) => a + b, 0) / nums.length; }
function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const avg = mean(nums);
  return Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length);
}

function classifyFrequency(days: number): { label: RecurringItem["frequency"]; days: number } | null {
  if (days >= 6   && days <= 8)   return { label: "weekly",     days: 7   };
  if (days >= 12  && days <= 16)  return { label: "bi-weekly",  days: 14  };
  if (days >= 25  && days <= 35)  return { label: "monthly",    days: 30  };
  if (days >= 80  && days <= 100) return { label: "quarterly",  days: 91  };
  if (days >= 350 && days <= 380) return { label: "annual",     days: 365 };
  return null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 40);
}

export async function detectAndSaveRecurring(): Promise<RecurringItem[]> {
  const existing = await loadRecurring();
  const existingMap = new Map(existing.map(r => [r.merchantKey, r]));

  const analyses = await listAnalyses();
  const full = (await Promise.all(analyses.map(a => loadAnalysis(a.month)))).filter(Boolean);
  const allTxns: SavedTransaction[] = full.flatMap(a => a!.transactions);

  // Group by normalized display name + transaction type
  const groups = new Map<string, SavedTransaction[]>();
  for (const t of allTxns) {
    const name = normalize(t.cleanDescription ?? t.merchantKey ?? t.description ?? "");
    if (!name) continue;
    const gk = `${name}::${t.type}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk)!.push(t);
  }

  const detected: RecurringItem[] = [];

  for (const txns of groups.values()) {
    if (txns.length < 2) continue;

    // Deduplicate: same date + same amount = same txn across re-analyses
    const dedup = new Map<string, SavedTransaction>();
    for (const t of txns) {
      const dk = `${t.date}::${Math.round(t.amount * 100)}`;
      if (!dedup.has(dk)) dedup.set(dk, t);
    }
    const sorted = [...dedup.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 2) continue;

    // Compute day gaps
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000);
    }

    const medGap = median(gaps);
    const freq = classifyFrequency(medGap);
    if (!freq) continue;

    // Reject if timing is inconsistent
    const gapCV = gaps.length > 1 ? stdDev(gaps) / medGap : 0;
    if (gapCV > 0.35) continue;

    const amounts = sorted.map(t => t.amount);
    const avgAmount = mean(amounts);
    const amountCV = stdDev(amounts) / avgAmount;

    const confidence: RecurringItem["confidence"] =
      amountCV < 0.05 && gapCV < 0.15 ? "high" :
      amountCV < 0.2  && gapCV < 0.3  ? "medium" : "low";

    const last = sorted[sorted.length - 1];
    const merchantKey = normalize(last.cleanDescription ?? last.merchantKey ?? last.description ?? "");
    const prev = existingMap.get(merchantKey);

    const lastDate = new Date(last.date);
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + freq.days);

    detected.push({
      id: prev?.id ?? randomUUID(),
      merchantKey,
      displayName: last.cleanDescription ?? last.description ?? merchantKey,
      category: last.category ?? "Other",
      necessity: last.necessity ?? "optional",
      type: last.type === "credit" ? "income" : "expense",
      frequency: freq.label,
      frequencyDays: freq.days,
      amount: avgAmount,
      amountMin: Math.min(...amounts),
      amountMax: Math.max(...amounts),
      lastSeen: last.date,
      nextPredicted: nextDate.toISOString().slice(0, 10),
      occurrences: sorted.map(t => ({ date: t.date, amount: t.amount })),
      confidence,
      confirmed: prev?.confirmed,
      dismissed: prev?.dismissed,
      detectedAt: new Date().toISOString(),
    });
  }

  detected.sort((a, b) => a.nextPredicted.localeCompare(b.nextPredicted));
  await saveRecurring(detected);
  return detected;
}
