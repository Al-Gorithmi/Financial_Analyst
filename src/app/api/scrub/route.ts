import { NextRequest, NextResponse } from "next/server";
import { scrubPII } from "@/lib/pii-scrubber";
import { withSpan } from "@/lib/telemetry";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (typeof text !== "string") {
      return NextResponse.json({ error: "text must be a string" }, { status: 400 });
    }

    const result = await withSpan("pii.scrub", { "text.length": text.length }, async () => scrubPII(text));
    return NextResponse.json(result);
  } catch (err) {
    console.error("[scrub]", err);
    return NextResponse.json({ error: "Failed to scrub text" }, { status: 500 });
  }
}
