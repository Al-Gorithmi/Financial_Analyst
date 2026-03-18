export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { BatchSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  const { FileSpanExporter } = await import("./src/lib/file-span-exporter");

  const provider = new NodeTracerProvider({
    spanProcessors: [new BatchSpanProcessor(new FileSpanExporter())],
  });
  provider.register();
}
