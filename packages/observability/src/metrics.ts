/**
 * Prometheus metrics — exposed on GET /metrics.
 *
 * Standard Node.js default metrics are collected automatically.
 * Domain-specific metrics are defined here as the single source of truth.
 * Services import and increment these — never create ad-hoc metrics elsewhere.
 */
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from "prom-client";

export const registry = new Registry();

// Collect default Node.js metrics (event loop lag, GC, memory, CPU)
collectDefaultMetrics({ register: registry });

// ── Agent ─────────────────────────────────────────────────────────────────────

export const agentSessionsTotal = new Counter({
  name:    "cio_agent_sessions_total",
  help:    "Total agent sessions initiated",
  labelNames: ["tenant_id", "state"],
  registers: [registry],
});

export const agentStateTransitionDuration = new Histogram({
  name:    "cio_agent_state_transition_duration_seconds",
  help:    "Duration of agent state machine transitions",
  labelNames: ["from_state", "to_state"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const agentActionsTotal = new Counter({
  name:    "cio_agent_actions_total",
  help:    "Total agent actions by decision type",
  labelNames: ["tenant_id", "action_type", "decision"],
  registers: [registry],
});

export const pendingApprovalsGauge = new Gauge({
  name:    "cio_agent_pending_approvals",
  help:    "Current number of pending approval requests",
  labelNames: ["tenant_id"],
  registers: [registry],
});

// ── LLM ──────────────────────────────────────────────────────────────────────

export const llmCallDuration = new Histogram({
  name:    "cio_llm_call_duration_seconds",
  help:    "LLM API call duration",
  labelNames: ["provider", "model", "tenant_id"],
  buckets: [0.5, 1, 2, 4, 8, 15, 30],
  registers: [registry],
});

export const llmCallsTotal = new Counter({
  name:    "cio_llm_calls_total",
  help:    "Total LLM calls",
  labelNames: ["provider", "model", "status"],
  registers: [registry],
});

export const llmTokensUsed = new Counter({
  name:    "cio_llm_tokens_used_total",
  help:    "Total LLM tokens consumed",
  labelNames: ["provider", "model", "tenant_id", "token_type"],
  registers: [registry],
});

// ── Credits ───────────────────────────────────────────────────────────────────

export const creditsConsumed = new Counter({
  name:    "cio_credits_consumed_total",
  help:    "Total credits consumed",
  labelNames: ["tenant_id", "action_type"],
  registers: [registry],
});

export const creditsBalance = new Gauge({
  name:    "cio_credits_balance",
  help:    "Current credit balance per tenant",
  labelNames: ["tenant_id"],
  registers: [registry],
});

export const creditExhaustionTotal = new Counter({
  name:    "cio_credit_exhaustion_total",
  help:    "Times a tenant exhausted credits mid-action",
  labelNames: ["tenant_id"],
  registers: [registry],
});

// ── Connectors ────────────────────────────────────────────────────────────────

export const connectorHealthGauge = new Gauge({
  name:    "cio_connector_health",
  help:    "Connector health status (1=healthy, 0=unhealthy)",
  labelNames: ["tenant_id", "connector_type"],
  registers: [registry],
});

export const connectorCallDuration = new Histogram({
  name:    "cio_connector_call_duration_seconds",
  help:    "Connector read/write operation duration",
  labelNames: ["connector_type", "operation"],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const connectorDlqTotal = new Counter({
  name:    "cio_connector_dlq_total",
  help:    "Events moved to dead-letter queue",
  labelNames: ["tenant_id", "connector_type"],
  registers: [registry],
});

// ── HTTP ──────────────────────────────────────────────────────────────────────

export const httpRequestDuration = new Histogram({
  name:    "cio_http_request_duration_seconds",
  help:    "HTTP request duration",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});
