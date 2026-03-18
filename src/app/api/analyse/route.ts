import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/claude";
import { openai } from "@/lib/openai";
import { withSpan } from "@/lib/telemetry";
import { loadStatement } from "@/lib/storage";
import { saveAnalysis, tagTransactionsWithMerchantKeys } from "@/lib/analysis-storage";
import { loadMerchantTags } from "@/lib/merchant-tags";
import { jsonrepair } from "jsonrepair";

export interface AnalysisCategory {
  name: string;
  amount: number;
  percentage: number;
}

export interface TopMerchant {
  name: string;
  amount: number;
  visits: number;
}

export interface MonthlyTotal {
  month: string;
  amount: number;
}

export interface RawTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";   // debit = money out, credit = money in
  category: string;
  confidence: "high" | "low";
  necessity: string;
  merchantKey: string;
  isTransfer: boolean;
}

export interface StructuredAnalysis {
  period: string;
  month: string;          // YYYY-MM
  totalSpend: number;
  categories: AnalysisCategory[];
  topMerchants: TopMerchant[];
  monthlyTotals: MonthlyTotal[];
  anomalies: string[];
  transactions: RawTransaction[];
}

const SYSTEM_PROMPT = `You are a personal finance analyst. The user will provide scrubbed CIBC bank/credit card statement text (PII has been redacted). Analyse the spending data accurately and extract every transaction. When multiple statements are provided (e.g. a chequing account AND a credit card), you MUST reconcile them: a payment from chequing to the credit card is NOT spending — it is an inter-account transfer and must be excluded from totalSpend and category totals.`;

const USER_PROMPT = (text: string, knownTagsJson: string) => `Analyse the following scrubbed statement(s) and return ONLY a valid JSON object — no markdown fences, no explanation, just the raw JSON.

Use this exact schema:
{
  "period": "string — human-readable date range, e.g. January–March 2024",
  "month": "YYYY-MM — the primary/most recent calendar month in the data",
  "totalSpend": number — total debits/purchases (CAD, 2 decimal places),
  "categories": [
    { "name": string, "amount": number, "percentage": number }
  ],
  "topMerchants": [
    { "name": string, "amount": number, "visits": number }
  ],
  "monthlyTotals": [
    { "month": string, "amount": number }
  ],
  "anomalies": [string],
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "original transaction description, cleaned (max 60 chars)",
      "amount": number (always positive),
      "type": "debit" or "credit",
      "category": string,
      "confidence": "high" or "low",
      "necessity": one of "Must" | "Essential" | "Good to Have" | "Optional" | "Non-Essential",
      "merchantKey": "SHORT_MERCHANT_KEY in uppercase, e.g. LOBLAWS, TIM HORTONS, NETFLIX",
      "isTransfer": boolean
    }
  ]
}

Rules:

CIBC TABLE STRUCTURE — this is critical:
CIBC chequing/savings PDFs have columns: Date | Description | Withdrawals | Deposits | Balance
After PDF text extraction the columns are flattened. Use these heuristics to determine type:
  • If a row has two numbers at the end, the first is amount and the second is running balance.
  • If the running balance DECREASED vs the previous row → type="debit" (withdrawal)
  • If the running balance INCREASED vs the previous row → type="credit" (deposit)
  • "E-TRANSFER FROM …" lines are almost always type="credit" (money coming in)
  • "E-TRANSFER TO …" or "E-TRANSFER SENT …" lines are type="debit" (money going out)
  • "PAYROLL", "DIRECT DEPOSIT", "SALARY", "DEPOSIT" → type="credit"
  • CIBC credit card statements use a single Amount column; purchases = debit, "PAYMENT" = credit.
  • When unsure, set confidence="low".

- transactions: include EVERY transaction, both debits AND credits. Keep descriptions concise (≤60 chars).
- type: "debit" = money leaving the account; "credit" = money entering (income, deposits, refunds).
- amount: always a positive number regardless of type.
- categories:
  • For debits: 8–12 groups from Groceries, Dining, Coffee, Gas, Transit, Subscriptions, Shopping, Healthcare, Entertainment, Travel, Utilities, Fees, Donations, Transfer, Other.
  • For credits: use Income, E-Transfer In, Refund, or Transfer.
  Sort by total amount descending (debits only for the main category list).
- topMerchants: up to 10 debit merchants, sorted by amount descending.
- monthlyTotals: one entry per calendar month. Amount = sum of debits only (spending).
- totalSpend: sum of all debit transactions EXCLUDING isTransfer=true rows. Credits are NOT included.
- anomalies: 2–5 notable observations (include any unusually large credits/income).
- isTransfer: true for inter-account transfers that must NOT count as spending:
  • Chequing → credit card payments ("CIBC VISA PAYMENT", "CREDIT CARD PAYMENT")
  • Credit card payment credits ("PAYMENT RECEIVED", "PAYMENT - THANK YOU")
  • Account-to-account transfers, LOC payments, savings transfers
  Set isTransfer=false for everything else including E-transfers to other people (that IS spending/sending).
- necessity: for debits only, classify using exactly one of these values:
  Must = rent/mortgage, insurance, minimum debt payments, medication
  Essential = groceries, utilities, phone, internet, transit pass
  Good to Have = gym, streaming, coffee habit, regular dining
  Optional = occasional dining out, shopping, entertainment
  Non-Essential = impulse purchases, luxury items, excessive discretionary spend
  (For credits, set necessity="Must" as placeholder — it will be ignored.)
- All amounts in CAD. percentages should sum to 100.
${knownTagsJson ? `\nKnown merchant categories (apply these when you recognise the merchant):\n${knownTagsJson}` : ""}

STATEMENT TEXT:
${text}`;

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json() as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    // Load all statements
    const statements = await Promise.all(ids.map((id) => loadStatement(id)));
    const missing = ids.filter((_, i) => !statements[i]);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Statement(s) not found: ${missing.join(", ")}` },
        { status: 404 }
      );
    }

    const combinedText = statements
      .map((s, i) => `--- Statement ${i + 1}: ${s!.filename} ---\n${s!.scrubbedText}`)
      .join("\n\n");

    // Load known merchant tags to improve categorisation
    const knownTags = await loadMerchantTags();
    const knownTagsJson = Object.keys(knownTags).length > 0
      ? JSON.stringify(knownTags, null, 2)
      : "";

    let raw = "";

    // Try OpenAI first; fall back to Claude if it errors OR returns empty content
    try {
      const completion = await withSpan("openai.analyse", { "text.length": combinedText.length, model: "gpt-5" }, () =>
        openai.chat.completions.create({
          model: "gpt-5",
          max_completion_tokens: 32768,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: USER_PROMPT(combinedText, knownTagsJson) },
          ],
        })
      );
      raw = completion.choices[0]?.message?.content ?? "";
      if (!raw) {
        console.warn("[analyse] OpenAI returned empty content, finish_reason:", completion.choices[0]?.finish_reason);
      }
    } catch (openaiErr) {
      console.warn("[analyse] OpenAI threw, falling back to Claude:", openaiErr);
    }

    if (!raw) {
      console.log("[analyse] Trying Claude...");
      const message = await withSpan("claude.analyse", { "text.length": combinedText.length, model: "claude-sonnet-4-6" }, () =>
        anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: USER_PROMPT(combinedText, knownTagsJson) }],
        })
      );
      raw = message.content[0].type === "text" ? message.content[0].text : "";
    }

    if (!raw) throw new Error("Both OpenAI and Claude returned empty responses.");

    // Strip accidental markdown fences, then repair any malformed JSON
    // (unescaped quotes in strings, single quotes, trailing commas, etc.)
    const stripped = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const analysis: StructuredAnalysis = JSON.parse(jsonrepair(stripped));

    // Validate / normalise month field
    const month = /^\d{4}-\d{2}$/.test(analysis.month)
      ? analysis.month
      : new Date().toISOString().slice(0, 7);

    // Attach IDs and apply merchant tag overrides — never let a bad transaction crash the save
    let transactions: ReturnType<typeof tagTransactionsWithMerchantKeys> = [];
    try {
      transactions = tagTransactionsWithMerchantKeys(
        analysis.transactions ?? [],
        knownTags
      );
    } catch (txnErr) {
      console.warn("[analyse] Failed to tag transactions, saving without them:", txnErr);
    }

    // Split transactions by calendar month and save one file per month
    const txnsByMonth = new Map<string, typeof transactions>();
    for (const t of transactions) {
      const m = (t.date ?? "").slice(0, 7) || month;
      if (!txnsByMonth.has(m)) txnsByMonth.set(m, []);
      txnsByMonth.get(m)!.push(t);
    }

    // If no valid date split happened, fall back to single month
    if (txnsByMonth.size === 0) txnsByMonth.set(month, transactions);

    for (const [m, monthTxns] of txnsByMonth.entries()) {
      // Only count outgoing, non-transfer transactions in spend totals
      const spendTxns = monthTxns.filter((t) => !t.isTransfer && t.type !== "credit");
      const monthTotal = spendTxns.reduce((s, t) => s + (t.amount ?? 0), 0);

      // Recompute categories from non-transfer transactions only
      const catMap = new Map<string, number>();
      for (const t of spendTxns) {
        const cat = t.category ?? "Other";
        catMap.set(cat, (catMap.get(cat) ?? 0) + (t.amount ?? 0));
      }
      const monthCategories = [...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({
          name,
          amount,
          percentage: monthTotal > 0 ? Math.round((amount / monthTotal) * 100) : 0,
        }));

      // Recompute top merchants (transfers excluded)
      const merchantMap = new Map<string, { amount: number; visits: number; displayName: string }>();
      for (const t of spendTxns) {
        const key = (t.merchantKey || t.description || "Unknown").slice(0, 30);
        const ex = merchantMap.get(key) ?? { amount: 0, visits: 0, displayName: t.description ?? key };
        merchantMap.set(key, { amount: ex.amount + (t.amount ?? 0), visits: ex.visits + 1, displayName: ex.displayName });
      }
      const monthMerchants = [...merchantMap.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 10)
        .map(([, v]) => ({ name: v.displayName, amount: v.amount, visits: v.visits }));

      const monthDate = new Date(m + "-02"); // avoid timezone edge
      const monthPeriod = monthDate.toLocaleDateString("en-CA", { year: "numeric", month: "long" });

      try {
        await saveAnalysis({
          month: m,
          generatedAt: new Date().toISOString(),
          statementIds: ids,
          period: monthPeriod,
          totalSpend: monthTotal,
          categories: monthCategories,
          topMerchants: monthMerchants,
          monthlyTotals: [{ month: monthPeriod, amount: monthTotal }],
          anomalies: txnsByMonth.size === 1 ? (analysis.anomalies ?? []) : [],
          transactions: monthTxns,
        });
      } catch (saveErr) {
        console.error(`[analyse] Failed to save month ${m}:`, saveErr);
      }
    }

    return NextResponse.json({ ...analysis, month, transactions });
  } catch (err) {
    console.error("[analyse]", err);
    const anthropicMsg = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
    const fallback = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: anthropicMsg ?? fallback }, { status: 500 });
  }
}
