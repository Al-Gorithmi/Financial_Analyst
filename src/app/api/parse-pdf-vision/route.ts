import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/claude";
import { withSpan } from "@/lib/telemetry";

const SYSTEM = `You are a bank statement OCR assistant. You will receive a PDF bank statement.
Extract every transaction ONLY from the page numbers listed by the user. Skip all other pages.
Return ONLY a clean markdown table with these exact columns:
| Date | Description | Withdrawals | Deposits | Balance |
Include every single transaction row — do not skip any, do not summarise.
For credit card statements that have a single Amount column, use Withdrawals for purchases and Deposits for payments/credits.
Do not include page headers, account numbers, or any other text — just the markdown table.`;

export async function POST(req: NextRequest) {
  try {
    const { pdf, pages } = await req.json() as { pdf: string; pages: number[] };
    if (!pdf) return NextResponse.json({ error: "No PDF provided" }, { status: 400 });
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ error: "No pages selected" }, { status: 400 });
    }

    const content: Anthropic.MessageParam["content"] = [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf },
      } as Anthropic.DocumentBlockParam,
      {
        type: "text",
        text: `${SYSTEM}\n\nExtract transactions from pages: ${pages.join(", ")} only.`,
      },
    ];

    const msg = await withSpan("claude.pdf_extract", { "pdf.pages": pages.join(","), "pdf.page_count": pages.length }, () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 16384,
        messages: [{ role: "user", content }],
      })
    );

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    if (!text) throw new Error("Claude returned empty response");

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[parse-pdf]", err);
    const msg = err instanceof Error ? err.message : "PDF extraction failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
