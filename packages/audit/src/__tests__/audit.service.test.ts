import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AuditDb } from "@cio-agent/db";

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock("@cio-agent/db", () => ({
  auditEvents: {},
}));

function makeAuditDb() {
  const values = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values });
  return { db: { insert } as unknown as AuditDb, insert, values };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AuditService", () => {
  let AuditService: typeof import("../audit.service.js").AuditService;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    ({ AuditService } = await import("../audit.service.js"));
  });

  // ─── log ───────────────────────────────────────────────────────────────────

  describe("log", () => {
    it("inserts the event directly into auditDb", async () => {
      const { db, insert, values } = makeAuditDb();
      const svc = new AuditService(db);

      await svc.log({
        tenant_id:  "tenant-1",
        event_type: "AUTH_LOGIN",
      });

      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: "tenant-1", event_type: "AUTH_LOGIN" }),
      );
    });
  });

  // ─── logEvent ──────────────────────────────────────────────────────────────

  describe("logEvent", () => {
    it("maps CreateAuditEventParams to AuditEventInsert and inserts", async () => {
      const { db, values } = makeAuditDb();
      const svc = new AuditService(db);

      await svc.logEvent({
        tenantId:    "tenant-2",
        userId:      "user-uuid",
        sessionId:   "session-uuid",
        eventType:   "JIRA_READ",
        action:      "issue.get",
        entityType:  "jira_issue",
        entityId:    "issue-uuid",
        beforeState: { status: "open" },
        afterState:  { status: "open" },
        ipAddress:   "10.0.0.1",
        userAgent:   "Mozilla/5.0",
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id:    "tenant-2",
          user_id:      "user-uuid",
          session_id:   "session-uuid",
          event_type:   "JIRA_READ",
          action:       "issue.get",
          entity_type:  "jira_issue",
          entity_id:    "issue-uuid",
          before_state: { status: "open" },
          after_state:  { status: "open" },
          ip_address:   "10.0.0.1",
          user_agent:   "Mozilla/5.0",
        }),
      );
    });

    it("sets before_state and after_state to null when not provided", async () => {
      const { db, values } = makeAuditDb();
      const svc = new AuditService(db);

      await svc.logEvent({ tenantId: "tenant-3", eventType: "USER_CREATED" });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ before_state: null, after_state: null }),
      );
    });
  });

  // ─── logStateTransition ────────────────────────────────────────────────────

  describe("logStateTransition", () => {
    it("inserts AGENT_STATE_TRANSITION event with correct before/after states", async () => {
      const { db, values } = makeAuditDb();
      const svc = new AuditService(db);

      await svc.logStateTransition({
        tenantId:  "tenant-4",
        userId:    "user-uuid",
        sessionId: "session-uuid",
        fromState: "RECEIVED",
        toState:   "CONTEXT_LOADED",
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type:   "AGENT_STATE_TRANSITION",
          entity_type:  "agent_session",
          entity_id:    "session-uuid",
          before_state: { state: "RECEIVED" },
          after_state:  { state: "CONTEXT_LOADED" },
        }),
      );
    });

    it("sets session_id as entity_id", async () => {
      const { db, values } = makeAuditDb();
      const svc = new AuditService(db);

      await svc.logStateTransition({
        tenantId:  "tenant-5",
        sessionId: "my-session",
        fromState: "EXECUTING",
        toState:   "COMPLETED",
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: "my-session", entity_id: "my-session" }),
      );
    });
  });
});
