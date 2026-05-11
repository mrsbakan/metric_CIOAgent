/**
 * Structured logger — pino.
 *
 * Output: JSON to stdout → Logstash (TCP 5000) → Elasticsearch.
 * Every log record automatically includes:
 *   - service, env, level, timestamp
 *   - trace_id (injected from active OTel span)
 *   - tenant_id (when set via child logger)
 *
 * Retention:
 *   - app logs  → cio-agent-* index  → 90-day ILM policy
 *   - audit logs → cio-audit-* index  → 2-year ILM policy
 */
import pino, { type Logger } from "pino";
import { getCurrentTraceId } from "./tracer.js";

const SERVICE_NAME = process.env["SERVICE_NAME"] ?? "cio-agent";
const LOG_LEVEL    = process.env["LOG_LEVEL"] ?? "info";
const NODE_ENV     = process.env["NODE_ENV"] ?? "development";

const transport =
  NODE_ENV === "development"
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined;

export const logger: Logger = pino(
  {
    level: LOG_LEVEL,
    base: {
      service: SERVICE_NAME,
      env:     NODE_ENV,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Inject active trace_id into every log record automatically
    mixin() {
      const traceId = getCurrentTraceId();
      return traceId ? { trace_id: traceId } : {};
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  transport,
);

/**
 * Returns a child logger scoped to a tenant + session.
 * Use inside request handlers and agent orchestration.
 */
export function childLogger(
  tenantId: string,
  sessionId?: string,
): Logger {
  return logger.child({
    tenant_id:  tenantId,
    session_id: sessionId,
  });
}

/**
 * Audit logger — writes to a separate log stream tagged `log_type=audit`.
 * Logstash routes `log_type=audit` records to the `cio-audit-*` index
 * which has 2-year retention (vs 90-day for app logs).
 */
export const auditLogger: Logger = logger.child({ log_type: "audit" });
