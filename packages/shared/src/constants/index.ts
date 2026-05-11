// Agent state machine
export const AGENT_STATES = [
  "RECEIVED",
  "CONTEXT_LOADED",
  "PROMPT_COMPILED",
  "LLM_CALLED",
  "ACTION_DECIDED",
  "AWAITING_APPROVAL",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
] as const;

// Token budget allocation (percentage of total context window)
export const TOKEN_BUDGET = {
  SYSTEM_PROMPT: 0.2,
  MEMORY_AND_SKILLS: 0.3,
  CONVERSATION_HISTORY: 0.3,
  TOOL_DEFINITIONS: 0.1,
  USER_INPUT_RESERVE: 0.1,
} as const;

// Timeouts (milliseconds)
export const TIMEOUTS = {
  LLM_CALL_MS: 30_000,
  TOOL_EXECUTION_MS: 10_000,
  APPROVAL_WAIT_MS: 48 * 60 * 60 * 1000, // 48 hours
  MUTEX_LOCK_MS: 5 * 60 * 1000,           // 5 minutes
  SESSION_TTL_MS: 24 * 60 * 60 * 1000,   // 24 hours
  LICENSE_CACHE_TTL_MS: 60 * 60 * 1000,  // 1 hour
  LICENSE_READ_ONLY_GRACE_MS: 72 * 60 * 60 * 1000, // 72 hours
} as const;

// Retry policy
export const RETRY = {
  LLM_MAX_ATTEMPTS: 3,
  CONNECTOR_MAX_ATTEMPTS: 3, // after which → DLQ
} as const;

// Credit weights
export const CREDIT_WEIGHTS: Record<string, number> = {
  chatbot_simple: 1,
  chatbot_deep: 5,
  alert_create_update: 2,
  source_system_write: 5,
  okr_create_assign: 5,
  skill_execute: 10,
  escalation_trigger: 3,
  notification_send: 1,
  report_generate: 8,
};

// Redis key prefixes
export const REDIS_KEYS = {
  SESSION: "session",
  CREDIT: "credit",
  CREDIT_QUOTA: "credit_quota",
  LICENSE: "license",
  LOCK: "lock",
} as const;

// API version prefix
export const API_VERSION = "/v1" as const;
