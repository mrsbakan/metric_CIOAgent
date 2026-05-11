import type { ConnectorType } from "@cio-agent/shared/types";

export type ConnectorWriteAction = "create" | "update" | "transition";

export interface ConnectorConfig {
  id: string;
  tenantId: string;
  type: ConnectorType;
  name: string;
  authConfig: Record<string, unknown>;
  fieldMapping: Record<string, unknown>;
  webhookConfig: Record<string, unknown>;
}

export interface ConnectorReadParams {
  resourceType: string;
  query?: string;
  filters?: Record<string, unknown>;
  limit?: number;
  cursor?: string;
}

export interface ConnectorReadResult<T = unknown> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface ConnectorWriteParams {
  resourceType: string;
  action: ConnectorWriteAction;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export interface ConnectorWriteResult {
  resourceId: string;
  resourceType: string;
  action: ConnectorWriteAction;
  idempotencyKey: string;
  externalUrl?: string;
  raw?: unknown;
}

export interface ConnectorHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}
