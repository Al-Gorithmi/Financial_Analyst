import { NextRequest, NextResponse } from "next/server";
import { loadAnalysis, saveAnalysis } from "@/lib/analysis-storage";
import { callLLM, DEFAULT_MODEL } from "@/lib/llm";
import { loadConfig } from "@/lib/config-storage";
import { withSpan } from "@/lib/telemetry";
import { jsonrepair } from "jsonrepair";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const { month } = await params;

    // Allow model override from request body; fall back to config then default
    let model = DEFAULT_MODEL;
    try {
      const body = await req.json().catch(() => ({})) as { model?: string };
      const config = await loadConfig();
      model = body.model ?? config.selectedModel ?? DEFAULT_MODEL;
    } catch { /* use default */ }

    const analysis = await loadAnalysis(month);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const { totalSpend, categories, topMerchants, period } = analysis;
    const catLines = categories.map(c => `- ${c.name}: $${c.amount.toFixed(2)} (${c.percentage}%)`).join("\n");
    const merchantLines = topMerchants.slice(0, 8).map(m => `- ${m.name}: $${m.amount.toFixed(2)} (${m.visits} visit${m.visits !== 1 ? "s" : ""})`).join("\n");

    const prompt = `You are a personal finance coach for a Canadian. Analyze this monthly spending and return ONLY a JSON object — no markdown, no explanation.

Month: ${period}
Total spend: $${totalSpend.toFixed(2)} CAD

By category:
${catLines}

Top merchants:
${merchantLines}

Return exactly:
{ "observations": ["3-4 key observations about spending patterns"], "recommendations": ["3-4 specific actionable tips"], "savings": ["2-3 concrete opportunities with estimated monthly dollar amounts, e.g. \\"Brew coffee at home instead of daily café visits: save ~$60/mo\\""] }`;

    const raw = await withSpan("llm.insights", { month, model }, () =>
      callLLM(prompt, { model, maxTokens: 1024 })
    );

    const stripped = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const insights = JSON.parse(jsonrepair(stripped));

    analysis.insights = insights;
    await saveAnalysis(analysis);

    return NextResponse.json({ insights });
  } catch (err) {
    console.error("[analyses/month/insights] POST", err);
    const msg = err instanceof Error ? err.message : "Failed to generate insights";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
