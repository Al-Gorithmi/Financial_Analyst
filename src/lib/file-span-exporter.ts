import fs from "fs";
import path from "path";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";

const TRACES_FILE = path.join(process.cwd(), "data", "traces.jsonl");

function ensureDir() {
  const dir = path.dirname(TRACES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface TraceRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startMs: number;      // epoch ms
  durationMs: number;
  status: string;
  attributes: Record<string, string | number | boolean>;
  error?: string;
}

export class FileSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      ensureDir();
      const lines = spans.map((span) => {
        const startMs = span.startTime[0] * 1000 + span.startTime[1] / 1e6;
        const endMs   = span.endTime[0]   * 1000 + span.endTime[1]   / 1e6;
        const record: TraceRecord = {
          traceId:      span.spanContext().traceId,
          spanId:       span.spanContext().spanId,
          parentSpanId: (span as unknown as { parentSpanId?: string }).parentSpanId,
          name:         span.name,
          startMs,
          durationMs:   endMs - startMs,
          status:       span.status.code === 2 ? "error" : "ok",
          attributes:   Object.fromEntries(
            Object.entries(span.attributes).map(([k, v]) => [k, v as string | number | boolean])
          ),
          error: span.status.message,
        };
        return JSON.stringify(record);
      });
      fs.appendFileSync(TRACES_FILE, lines.join("\n") + "\n", "utf-8");
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (e) {
      resultCallback({ code: ExportResultCode.FAILED, error: e as Error });
    }
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
