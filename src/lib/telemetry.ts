import { trace, SpanStatusCode, type Attributes } from "@opentelemetry/api";

export const tracer = trace.getTracer("finance-analyzer");

/**
 * Run `fn` inside a named span. Sets error status + re-throws on failure.
 */
export async function withSpan<T>(
  name: string,
  attrs: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attrs);
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
