import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

export async function POST(req: NextRequest) {
  try {
    const { model, prompt, system } = await req.json() as {
      model: string;
      prompt: string;
      system?: string;
    };

    if (!model || !prompt) {
      return NextResponse.json({ error: "model and prompt required" }, { status: 400 });
    }

    const response = await callLLM(prompt, { model, system, maxTokens: 2048 });
    return NextResponse.json({ response });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
