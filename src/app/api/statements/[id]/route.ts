import { NextRequest, NextResponse } from "next/server";
import { loadStatement } from "@/lib/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const statement = await loadStatement(id);
  if (!statement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Return full statement including parsedTransactions — omit raw text to keep response lean
  const { rawText: _r, scrubbedText: _s, ...rest } = statement;
  return NextResponse.json(rest);
}
