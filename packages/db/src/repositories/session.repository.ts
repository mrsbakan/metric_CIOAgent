import { eq, and, desc } from "drizzle-orm";
import type { Db } from "../client.js";
import { agentSessions, pendingApprovals } from "../schema/agent-session.js";
import type { AgentState } from "@cio-agent/shared/types";

const TERMINAL_STATES: readonly AgentState[] = ["COMPLETED", "FAILED"];

export type SessionRow   = typeof agentSessions.$inferSelect;
export type ApprovalRow  = typeof pendingApprovals.$inferSelect;

export type CreateSessionParams = {
  tenant_id:  string;
  user_id:    string;
  role_id:    string;
  expires_at: Date;
  context?:   Record<string, unknown>;
};

export async function createSession(db: Db, params: CreateSessionParams): Promise<SessionRow> {
  const [row] = await db
    .insert(agentSessions)
    .values({ ...params, state: "RECEIVED", context: params.context ?? {} })
    .returning();
  if (!row) throw new Error("createSession: insert returned no row");
  return row;
}

export async function getSessionById(db: Db, sessionId: string): Promise<SessionRow | undefined> {
  const [row] = await db.select().from(agentSessions).where(eq(agentSessions.id, sessionId));
  return row;
}

export async function getActiveSessionByUserId(
  db: Db,
  userId: string,
): Promise<SessionRow | undefined> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.user_id, userId));
  return rows.find((r) => !TERMINAL_STATES.includes(r.state as AgentState));
}

export async function updateSessionStateInDb(
  db: Db,
  sessionId: string,
  state: AgentState,
  context?: Record<string, unknown>,
): Promise<SessionRow> {
  const patch: Partial<typeof agentSessions.$inferInsert> = {
    state,
    updated_at: new Date(),
  };
  if (context !== undefined) patch.context = context;

  const [row] = await db
    .update(agentSessions)
    .set(patch)
    .where(eq(agentSessions.id, sessionId))
    .returning();
  if (!row) throw new Error(`updateSessionState: session ${sessionId} not found`);
  return row;
}

export async function createPendingApprovalInDb(
  db: Db,
  params: {
    tenant_id:   string;
    session_id:  string;
    action_type: string;
    payload:     Record<string, unknown>;
  },
): Promise<ApprovalRow> {
  const [row] = await db.insert(pendingApprovals).values(params).returning();
  if (!row) throw new Error("createPendingApproval: insert returned no row");
  return row;
}

export async function getPendingApprovalById(
  db: Db,
  approvalId: string,
): Promise<ApprovalRow | undefined> {
  const [row] = await db
    .select()
    .from(pendingApprovals)
    .where(eq(pendingApprovals.id, approvalId));
  return row;
}

export async function getApprovalsByTenant(
  db: Db,
  tenantId: string,
  status?: "pending" | "approved" | "rejected",
): Promise<ApprovalRow[]> {
  const conditions = [eq(pendingApprovals.tenant_id, tenantId)];
  if (status) conditions.push(eq(pendingApprovals.status, status));
  return db
    .select()
    .from(pendingApprovals)
    .where(and(...conditions))
    .orderBy(desc(pendingApprovals.requested_at));
}

export async function resolveApprovalInDb(
  db: Db,
  approvalId: string,
  params: { status: "approved" | "rejected"; resolvedBy: string; resolvedAt: Date },
): Promise<ApprovalRow> {
  const [row] = await db
    .update(pendingApprovals)
    .set({ status: params.status, resolved_by: params.resolvedBy, resolved_at: params.resolvedAt })
    .where(eq(pendingApprovals.id, approvalId))
    .returning();
  if (!row) throw new Error(`resolveApproval: approval ${approvalId} not found`);
  return row;
}
