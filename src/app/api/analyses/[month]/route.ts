import { NextRequest, NextResponse } from "next/server";
import { loadAnalysis } from "@/lib/analysis-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const { month } = await params;
    const analysis = await loadAnalysis(month);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyses/month] GET", err);
    return NextResponse.json({ error: "Failed to load analysis" }, { status: 500 });
  }
}
