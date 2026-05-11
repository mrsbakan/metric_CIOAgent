/**
 * OpenTelemetry tracer — sends traces to Grafana Tempo via OTLP HTTP.
 *
 * Call initTracer() once at process startup BEFORE importing any instrumented
 * libraries (http, pg, ioredis). Order matters for auto-instrumentation.
 *
 * All downstream spans automatically carry trace_id. The trace_id is injected
 * into log records by the logger module so logs and traces are correlated.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { trace, type Tracer } from "@opentelemetry/api";

let sdk: NodeSDK | null = null;

export function initTracer(serviceName: string, serviceVersion = "0.1.0"): void {
  if (sdk) return; // idempotent

  const exporter = new OTLPTraceExporter({
    url: `${process.env["GRAFANA_TEMPO_URL"] ?? "http://localhost:4318"}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]:    serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
      "deployment.environment": process.env["NODE_ENV"] ?? "development",
    }),
    traceExporter: exporter,
    instrumentations: [
      new HttpInstrumentation({
        // Do not trace health checks — reduces noise
        ignoreIncomingRequestHook: (req) =>
          req.url === "/health" || req.url === "/metrics",
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk?.shutdown().catch(console.error);
  });
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

export function getCurrentTraceId(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return ctx.traceId;
}
