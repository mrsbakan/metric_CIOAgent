import type { AuditDb, AuditEventInsert } from "@cio-agent/db";
import { auditEvents } from "@cio-agent/db";
import type { CreateAuditEventParams } from "./types.js";

export class AuditService {
  constructor(private readonly auditDb: AuditDb) {}

  async log(event: AuditEventInsert): Promise<void> {
    await this.auditDb.insert(auditEvents).values(event);
  }

  async logEvent(params: CreateAuditEventParams): Promise<void> {
    await this.log({
      tenant_id:    params.tenantId,
      user_id:      params.userId,
      session_id:   params.sessionId,
      event_type:   params.eventType,
      action:       params.action,
      entity_type:  params.entityType,
      entity_id:    params.entityId,
      before_state: params.beforeState ?? null,
      after_state:  params.afterState ?? null,
      ip_address:   params.ipAddress,
      user_agent:   params.userAgent,
    });
  }

  async logStateTransition(params: {
    tenantId: string;
    userId?: string;
    sessionId: string;
    fromState: string;
    toState: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.logEvent({
      tenantId:    params.tenantId,
      sessionId:   params.sessionId,
      eventType:   "AGENT_STATE_TRANSITION",
      entityType:  "agent_session",
      entityId:    params.sessionId,
      beforeState: { state: params.fromState },
      afterState:  { state: params.toState },
      ...(params.userId    !== undefined && { userId:    params.userId }),
      ...(params.ipAddress !== undefined && { ipAddress: params.ipAddress }),
    });
  }
}
