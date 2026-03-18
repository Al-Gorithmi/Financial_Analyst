import { NextRequest, NextResponse } from "next/server";
import { loadAnalysis, saveAnalysis } from "@/lib/analysis-storage";
import { anthropic } from "@/lib/claude";
import { withSpan } from "@/lib/telemetry";
import { jsonrepair } from "jsonrepair";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  try {
    const { month } = await params;
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

    const msg = await withSpan("claude.insights", { month }, () =>
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      })
    );

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
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
