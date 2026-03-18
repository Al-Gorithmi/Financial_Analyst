import { NextRequest } from "next/server";
import { anthropic } from "@/lib/claude";
import { openai } from "@/lib/openai";
import { loadStatement } from "@/lib/storage";

const SYSTEM_PROMPT = `You are a friendly but precise personal finance analyst. The user will provide scrubbed CIBC bank/credit card statement text (PII has been redacted). Write clear, plain-English analysis with specific dollar amounts where relevant.`;

const USER_PROMPT = (text: string) => `Write a thorough analysis of the following scrubbed CIBC statement(s). Use markdown formatting.

Structure your response with these sections:
## Overview
One paragraph summarising the period, total spend, and the headline story.

## Spending Patterns
2–3 paragraphs covering the most significant categories, what they suggest about habits, and how months compare if multiple are present.

## Top Merchants
A short paragraph noting the top merchants and what they reveal (e.g. primary grocery store, frequent coffee habit, streaming subscriptions).

## Items to Review
A brief paragraph on anything unusual — unexpected charges, possible duplicates, fees, or anomalies worth investigating.

## Suggestions
A markdown list of 3 actionable, specific suggestions for reducing spend based on what you actually see in the data.

Be direct and specific. Mention actual amounts. Do not hedge excessively.

STATEMENT TEXT:
${text}`;

export async function POST(req: NextRequest) {
  try {
    const { ids } = (await req.json()) as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response("ids array is required", { status: 400 });
    }

    const statements = await Promise.all(ids.map((id) => loadStatement(id)));
    const missing = ids.filter((_, i) => !statements[i]);
    if (missing.length > 0) {
      return new Response(`Statement(s) not found: ${missing.join(", ")}`, {
        status: 404,
      });
    }

    const combinedText = statements
      .map((s, i) => `--- Statement ${i + 1}: ${s!.filename} ---\n${s!.scrubbedText}`)
      .join("\n\n");

    const readable = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let sentAny = false;
        try {
          // Try OpenAI first (cheaper), fall back to Claude
          try {
            const oaiStream = await openai.chat.completions.create({
              model: "gpt-5",
              max_completion_tokens: 2048,
              stream: true,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: USER_PROMPT(combinedText) },
              ],
            });
            for await (const chunk of oaiStream) {
              const text = chunk.choices[0]?.delta?.content ?? "";
              if (text) {
                controller.enqueue(encoder.encode(text));
                sentAny = true;
              }
            }
            return; // OpenAI succeeded
          } catch (openaiErr) {
            if (sentAny) {
              console.warn("[analyse/stream] OpenAI failed mid-stream:", openaiErr);
              return;
            }
            console.warn("[analyse/stream] OpenAI failed, falling back to Claude:", openaiErr);
          }

          // Fall back to Claude
          const claudeStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: USER_PROMPT(combinedText) }],
          });
          for await (const event of claudeStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[analyse/stream]", err);
    const anthropicMsg = (err as { error?: { error?: { message?: string } } })?.error?.error?.message;
    const fallback = err instanceof Error ? err.message : "Stream failed";
    return new Response(anthropicMsg ?? fallback, { status: 500 });
  }
}
