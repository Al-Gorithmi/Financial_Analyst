import { NextRequest, NextResponse } from "next/server";
import { listAnalyses, patchAnalysisNarrative } from "@/lib/analysis-storage";

export async function GET() {
  try {
    const analyses = await listAnalyses();
    return NextResponse.json(analyses);
  } catch (err) {
    console.error("[analyses] GET", err);
    return NextResponse.json({ error: "Failed to list analyses" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { month, narrative } = await req.json() as { month: string; narrative: string };
    if (!month || typeof narrative !== "string") {
      return NextResponse.json({ error: "month and narrative required" }, { status: 400 });
    }
    const ok = await patchAnalysisNarrative(month, narrative);
    if (!ok) return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[analyses] PATCH", err);
    return NextResponse.json({ error: "Failed to save narrative" }, { status: 500 });
  }
}
