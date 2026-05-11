import type { AgentState } from "@cio-agent/shared/types";
import type { Db } from "@cio-agent/db";
import {
  withRls,
  createSession,
  getSessionById,
  getActiveSessionByUserId,
  updateSessionStateInDb,
  createPendingApprovalInDb,
  getPendingApprovalById,
  type SessionRow,
  type ApprovalRow,
} from "@cio-agent/db";

export interface ISessionRepository {
  createSession(
    tenantId: string,
    params: { user_id: string; role_id: string; expires_at: Date; context?: Record<string, unknown> },
  ): Promise<SessionRow>;

  getSessionById(tenantId: string, sessionId: string): Promise<SessionRow | undefined>;

  getActiveSessionForUser(tenantId: string, userId: string): Promise<SessionRow | undefined>;

  updateSessionState(
    tenantId:  string,
    sessionId: string,
    state:     AgentState,
    context?:  Record<string, unknown>,
  ): Promise<SessionRow>;

  createPendingApproval(
    tenantId: string,
    params: { session_id: string; action_type: string; payload: Record<string, unknown> },
  ): Promise<ApprovalRow>;

  getPendingApproval(tenantId: string, approvalId: string): Promise<ApprovalRow | undefined>;
}

export class SessionRepository implements ISessionRepository {
  constructor(private readonly db: Db) {}

  createSession(
    tenantId: string,
    params: { user_id: string; role_id: string; expires_at: Date; context?: Record<string, unknown> },
  ): Promise<SessionRow> {
    return withRls(this.db, tenantId, (tx) =>
      createSession(tx, { ...params, tenant_id: tenantId }),
    );
  }

  getSessionById(tenantId: string, sessionId: string): Promise<SessionRow | undefined> {
    return withRls(this.db, tenantId, (tx) => getSessionById(tx, sessionId));
  }

  getActiveSessionForUser(tenantId: string, userId: string): Promise<SessionRow | undefined> {
    return withRls(this.db, tenantId, (tx) => getActiveSessionByUserId(tx, userId));
  }

  updateSessionState(
    tenantId:  string,
    sessionId: string,
    state:     AgentState,
    context?:  Record<string, unknown>,
  ): Promise<SessionRow> {
    return withRls(this.db, tenantId, (tx) =>
      updateSessionStateInDb(tx, sessionId, state, context),
    );
  }

  createPendingApproval(
    tenantId: string,
    params: { session_id: string; action_type: string; payload: Record<string, unknown> },
  ): Promise<ApprovalRow> {
    return withRls(this.db, tenantId, (tx) =>
      createPendingApprovalInDb(tx, { ...params, tenant_id: tenantId }),
    );
  }

  getPendingApproval(tenantId: string, approvalId: string): Promise<ApprovalRow | undefined> {
    return withRls(this.db, tenantId, (tx) => getPendingApprovalById(tx, approvalId));
  }
}
