// Agent state machine states
export type AgentState =
  | "RECEIVED"
  | "CONTEXT_LOADED"
  | "PROMPT_COMPILED"
  | "LLM_CALLED"
  | "ACTION_DECIDED"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

// Action decision matrix values
export type ActionDecision =
  | "AUTONOMOUS"
  | "DRAFT"
  | "APPROVAL_REQUIRED"
  | "NA";

// User types
export type UserType = "admin" | "power" | "standard" | "readonly";

// Credit action types
export type CreditActionType =
  | "chatbot_simple"
  | "chatbot_deep"
  | "alert_create_update"
  | "source_system_write"
  | "okr_create_assign"
  | "skill_execute"
  | "escalation_trigger"
  | "notification_send"
  | "report_generate";

// Audit event types
export type AuditEventType =
  | "agent_action_completed"
  | "agent_action_failed"
  | "approval_requested"
  | "approval_resolved"
  | "approval_rejected"
  | "prompt_layer_changed"
  | "prompt_layer_reverted"
  | "prompt_token_budget_trimmed"
  | "skill_created"
  | "skill_updated"
  | "skill_reverted"
  | "connector_write_executed"
  | "escalation_fired"
  | "document_uploaded"
  | "document_version_archived"
  | "credit_consumed"
  | "credit_exhausted"
  | "license_token_renewed"
  | "license_read_only_activated"
  | "user_created"
  | "role_created"
  | "role_updated";

// Connector types
export type ConnectorType = "jira" | "servicenow" | "azure" | "spirai";

// Prompt layer types
export type PromptLayerType =
  | "system"
  | "general"
  | "role"
  | "project"
  | "user";

// Approval status
export type ApprovalStatus = "pending" | "approved" | "rejected";

// Connector event status
export type ConnectorEventStatus = "pending" | "processed" | "dlq";

// Package status
export type PackageStatus = "draft" | "active" | "archived";

// License status
export type LicenseStatus = "active" | "expiring" | "expired" | "read_only";

// Pagination
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    has_more: boolean;
    total: number;
  };
}

// Standard API error
export interface ApiError {
  error: {
    code: string;
    message: string;
    detail?: string;
    trace_id: string;
  };
}

// Tenant context (injected by API gateway after JWT validation)
export interface TenantContext {
  user_id:                string;
  tenant_id:              string;
  role_id:                string;
  user_type:              UserType;
  account_application_id: string;
}
