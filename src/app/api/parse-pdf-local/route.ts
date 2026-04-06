import { NextRequest, NextResponse } from "next/server";
import { localGenerate } from "@/lib/local-llm";

const PROMPT = `You are a bank statement OCR assistant. Extract every transaction from the bank statement page images provided.
Return ONLY a clean markdown table with these exact columns:
| Date | Description | Withdrawals | Deposits | Balance |
Include every single transaction row — do not skip any, do not summarise.
For credit card statements that have a single Amount column, use Withdrawals for purchases and Deposits for payments/credits.
Do not include page headers, account numbers, totals rows, or any other text — just the markdown table rows.`;

export async function POST(req: NextRequest) {
  try {
    const { images, model } = await req.json() as { images: string[]; model: string };

    if (!images?.length) return NextResponse.json({ error: "No images provided" }, { status: 400 });
    if (!model) return NextResponse.json({ error: "No model specified" }, { status: 400 });

    const text = await localGenerate(model, PROMPT, { images });

    if (!text) throw new Error("Model returned empty response");
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[parse-pdf-local]", err);
    const msg = err instanceof Error ? err.message : "Local PDF extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
