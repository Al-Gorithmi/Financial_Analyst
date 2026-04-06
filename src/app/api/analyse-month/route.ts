import { NextRequest, NextResponse } from "next/server";
import { callLLM, DEFAULT_MODEL } from "@/lib/llm";
import { loadConfig } from "@/lib/config-storage";
import { withSpan } from "@/lib/telemetry";
import { loadStatement } from "@/lib/storage";
import { saveAnalysis, tagTransactionsWithMerchantKeys } from "@/lib/analysis-storage";
import { loadMerchantTags } from "@/lib/merchant-tags";
import { loadRules, matchRule } from "@/lib/transaction-rules";
import { loadConfig, saveConfig } from "@/lib/config-storage";
import { parseMarkdownTable, parseAmount } from "@/lib/parse-table";
import { jsonrepair } from "jsonrepair";
import type { RawTxnRow } from "@/lib/parse-table";
import { getDb } from "@/lib/db";

// Compact row sent to LLM — short keys reduce token count
interface CompactRow {
  i: number;
  d: string;   // dateISO YYYY-MM-DD
  desc: string;
  wd: number;  // withdrawal amount
  dep: number; // deposit amount
}

// LLM output row
interface TaggedRow {
  i: number;
  cat: string;
  nec: string;
  xfer: boolean;
  mk: string;
  tp: "debit" | "credit";
  clean?: string; // human-readable merchant name
}

const SYSTEM_PROMPT = `You are a finance transaction tagger. You will receive a JSON array of bank transactions.
Return ONLY a JSON array — no explanation, no markdown fences, just the raw JSON array.
Each element must tag one transaction.`;

function buildUserPrompt(rows: CompactRow[], knownTagsJson: string, rulesHint: string): string {
  return `Tag each transaction. Input fields: i (index), d (date YYYY-MM-DD), desc (description), wd (withdrawal $), dep (deposit $).

Return an array of the same length in the same order:
[{ "i": number, "cat": string, "nec": string, "xfer": boolean, "mk": string, "tp": "debit"|"credit", "clean": string }]

cat: Groceries|Dining|Coffee|Gas|Transit|Subscriptions|Shopping|Healthcare|Entertainment|Travel|Utilities|Fees|Donations|Investments|Income|E-Transfer In|Refund|Transfer|Other
Investments: transfers to Wealthsimple, Questrade, RRSP, TFSA, or any investment/brokerage account
nec: Must|Essential|Good to Have|Optional|Non-Essential  (use "Must" as placeholder for credits)
xfer: true ONLY for inter-account transfers (credit card payment, LOC payment, savings transfer to your own account). E-transfers to other people = false. Wealthsimple/investment transfers = false (use cat: Investments instead).
mk: short uppercase merchant key max 20 chars (e.g. LOBLAWS, NETFLIX, TIM HORTONS)
tp: "debit" if wd>0, "credit" if dep>0; override only if you're sure the column is wrong
clean: short readable merchant/payee name (e.g. "PYMT TIM HORTONS #1234 TORONTO" → "Tim Hortons", "NETFLIX.COM 866-579-7172" → "Netflix", "E-TRF John Smith" → "E-Transfer: John Smith")
${rulesHint ? `\nForced rules (always apply these):\n${rulesHint}` : ""}
${knownTagsJson ? `\nKnown merchant categories:\n${knownTagsJson}` : ""}

Transactions:
${JSON.stringify(rows)}`;
}

function buildInsightsPrompt(period: string, totalSpend: number, categories: { name: string; amount: number; percentage: number }[], topMerchants: { name: string; amount: number; visits: number }[]): string {
  const catLines = categories.map(c => `- ${c.name}: $${c.amount.toFixed(2)} (${c.percentage}%)`).join("\n");
  const merchantLines = topMerchants.slice(0, 8).map(m => `- ${m.name}: $${m.amount.toFixed(2)} (${m.visits} visit${m.visits !== 1 ? "s" : ""})`).join("\n");
  return `You are a personal finance coach for a Canadian. Analyze this monthly spending and return ONLY a JSON object — no markdown, no explanation.

Month: ${period}
Total spend: $${totalSpend.toFixed(2)} CAD

By category:
${catLines}

Top merchants:
${merchantLines}

Return exactly:
{ "observations": ["3-4 key observations about spending patterns"], "recommendations": ["3-4 specific actionable tips"], "savings": ["2-3 concrete opportunities with estimated monthly dollar amounts, e.g. \\"Brew coffee at home instead of daily café visits: save ~$60/mo\\""] }`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { month: string; statementIds: string[]; model?: string };
    const { month, statementIds } = body;
    const config = await loadConfig();
    const model = body.model ?? config.selectedModel ?? DEFAULT_MODEL;

    if (!month || !Array.isArray(statementIds) || statementIds.length === 0) {
      return NextResponse.json({ error: "month and statementIds required" }, { status: 400 });
    }

    // Load statements and collect rows for this month
    const statements = await Promise.all(statementIds.map(id => loadStatement(id)));
    const allRows: RawTxnRow[] = [];

    for (const stmt of statements) {
      if (!stmt) continue;
      const rows = stmt.parsedTransactions ?? parseMarkdownTable(stmt.rawText, stmt.uploadedAt);
      allRows.push(...rows.filter(r => r.dateISO.slice(0, 7) === month));
    }

    if (allRows.length === 0) {
      return NextResponse.json({ error: `No transactions found for ${month}` }, { status: 400 });
    }

    // Deduplicate by (dateISO + description + wd + dep)
    const seen = new Set<string>();
    const uniqueRows = allRows.filter(r => {
      const sig = `${r.dateISO}|${r.description.slice(0, 30)}|${r.withdrawals}|${r.deposits}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });

    // Build compact rows for LLM
    const compactRows: CompactRow[] = uniqueRows.map((r, i) => ({
      i,
      d: r.dateISO,
      desc: r.description.slice(0, 60),
      wd: parseAmount(r.withdrawals),
      dep: parseAmount(r.deposits),
    }));

    const knownTags = await loadMerchantTags();
    const rules = await loadRules();
    const knownTagsJson = Object.keys(knownTags).length > 0 ? JSON.stringify(knownTags, null, 2) : "";
    const rulesHint = rules.length > 0
      ? rules.map(r => `- "${r.pattern}" → category: ${r.category}, necessity: ${r.necessity}, label: "${r.label}"`).join("\n")
      : "";
    const userPrompt = buildUserPrompt(compactRows, knownTagsJson, rulesHint);

    // Call LLM — route through unified callLLM
    const raw = await withSpan("llm.analyse_month", { month, "txn.count": compactRows.length, model }, () =>
      callLLM(`${SYSTEM_PROMPT}\n\n${userPrompt}`, { model, maxTokens: 8192 })
    );

    if (!raw) throw new Error("LLM returned empty response");

    // Parse LLM tags
    const stripped = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const tagged: TaggedRow[] = JSON.parse(jsonrepair(stripped));

    // Build a lookup map by index
    const tagMap = new Map<number, TaggedRow>();
    for (const t of tagged) tagMap.set(t.i, t);

    // Merge tags back into full transactions
    const rawTxns = uniqueRows.map((r, i) => {
      const tag = tagMap.get(i) ?? { cat: "Other", nec: "Optional", xfer: false, mk: r.description.slice(0, 20).toUpperCase(), tp: r.withdrawals ? "debit" as const : "credit" as const, clean: undefined };
      const wd = parseAmount(r.withdrawals);
      const dep = parseAmount(r.deposits);
      return {
        date: r.dateISO,
        description: r.description,
        cleanDescription: tag.clean ?? undefined,
        amount: wd > 0 ? wd : dep,
        type: tag.tp,
        category: tag.cat,
        confidence: "high" as const,
        necessity: tag.nec,
        merchantKey: tag.mk,
        // Investments are never inter-account transfers — force visible in spending
        isTransfer: tag.cat === "Investments" ? false : tag.xfer,
        balance: parseAmount(r.balance) || undefined,
      };
    });

    // Apply forced transaction rules (always override LLM output)
    const ruledTxns = rawTxns.map(t => {
      const rule = matchRule(t.description, rules);
      if (!rule) return t;
      return {
        ...t,
        category: rule.category,
        necessity: rule.necessity,
        isTransfer: rule.isTransfer ?? t.isTransfer,
        cleanDescription: rule.label,
        merchantKey: rule.label.toUpperCase().slice(0, 20),
      };
    });

    const transactions = tagTransactionsWithMerchantKeys(ruledTxns, knownTags);

    // Compute aggregates server-side
    const spendTxns = transactions.filter(t => !t.isTransfer && t.type !== "credit");
    const incomeTxns = transactions.filter(t => !t.isTransfer && t.type === "credit");
    const totalSpend = spendTxns.reduce((s, t) => s + t.amount, 0);
    const totalIncome = incomeTxns.reduce((s, t) => s + t.amount, 0);

    const catMap = new Map<string, number>();
    for (const t of spendTxns) catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
    const categories = [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount, percentage: totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0 }));

    const merchantMap = new Map<string, { amount: number; visits: number; displayName: string }>();
    for (const t of spendTxns) {
      const key = (t.merchantKey || t.description || "Unknown").slice(0, 30);
      const ex = merchantMap.get(key) ?? { amount: 0, visits: 0, displayName: t.description ?? key };
      merchantMap.set(key, { amount: ex.amount + t.amount, visits: ex.visits + 1, displayName: ex.displayName });
    }
    const topMerchants = [...merchantMap.entries()]
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 10)
      .map(([, v]) => ({ name: v.displayName, amount: v.amount, visits: v.visits }));

    const monthDate = new Date(month + "-02");
    const period = monthDate.toLocaleDateString("en-CA", { year: "numeric", month: "long" });

    // Generate spending insights
    let insights: { observations: string[]; recommendations: string[]; savings: string[] } | undefined;
    try {
      const insightsRaw = await withSpan("llm.insights", { month, model }, () =>
        callLLM(buildInsightsPrompt(period, totalSpend, categories, topMerchants), { model, maxTokens: 1024 })
      );
      const insightsStripped = insightsRaw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      insights = JSON.parse(jsonrepair(insightsStripped));
    } catch (err) {
      console.warn("[analyse-month] insights generation failed:", err);
    }

    // Upsert all transactions into the unified SQLite DB
    const db = getDb();
    const upsert = db.prepare(`
      INSERT INTO transactions
        (id, date, month, description, cleanDescription, amount, type, category, necessity, merchantKey,
         isTransfer, userTagged, confidence, statementId, filename, analysedAt, balance)
      VALUES
        (@id, @date, @month, @description, @cleanDescription, @amount, @type, @category, @necessity, @merchantKey,
         @isTransfer, @userTagged, @confidence, @statementId, @filename, @analysedAt, @balance)
      ON CONFLICT(id) DO UPDATE SET
        category         = excluded.category,
        necessity        = excluded.necessity,
        merchantKey      = excluded.merchantKey,
        isTransfer       = excluded.isTransfer,
        type             = excluded.type,
        cleanDescription = excluded.cleanDescription,
        analysedAt       = excluded.analysedAt,
        balance          = excluded.balance
    `);

    const insertMany = db.transaction((txns: typeof transactions, stmtIds: string[], filenames: string[]) => {
      const analysedAt = new Date().toISOString();
      for (const t of txns) {
        upsert.run({
          ...t,
          month,
          cleanDescription: t.cleanDescription ?? null,
          balance: t.balance ?? null,
          isTransfer: t.isTransfer ? 1 : 0,
          userTagged: t.userTagged ? 1 : 0,
          statementId: stmtIds.join(","),
          filename: filenames.join(", "),
          analysedAt,
        });
      }
    });

    const filenames = statements.filter(Boolean).map(s => s!.filename);
    insertMany(transactions, statementIds, filenames);

    await saveAnalysis({
      month,
      generatedAt: new Date().toISOString(),
      statementIds,
      period,
      totalSpend,
      totalIncome,
      categories,
      topMerchants,
      monthlyTotals: [{ month: period, amount: totalSpend }],
      anomalies: [],
      transactions,
      insights,
    });

    // Advance latestAnalyzedDate if this month is more recent
    const config = await loadConfig();
    const monthCutoff = `${month}-28`;
    if (!config.latestAnalyzedDate || monthCutoff > config.latestAnalyzedDate) {
      await saveConfig({ latestAnalyzedDate: monthCutoff });
    }

    // Auto-detect recurring patterns in background (non-fatal)
    import("@/lib/recurring").then(({ detectAndSaveRecurring }) => detectAndSaveRecurring()).catch(() => {});

    return NextResponse.json({ month, totalSpend, txnCount: transactions.length });
  } catch (err) {
    console.error("[analyse-month]", err);
    const msg = err instanceof Error ? err.message : "Month analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
