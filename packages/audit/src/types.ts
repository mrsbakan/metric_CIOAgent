export interface CreateAuditEventParams {
  tenantId: string;
  userId?: string;
  sessionId?: string;
  eventType: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}
