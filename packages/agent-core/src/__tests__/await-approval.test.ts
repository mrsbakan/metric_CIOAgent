import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AgentDeps, AgentGraphState, ApprovalLockHandle } from "../types.js";
import type { ISessionRepository } from "../session-repository.js";
import type { AuditService } from "@cio-agent/audit";
import type { ApprovalRow, SessionRow } from "@cio-agent/db";
import type { IMemoryService } from "../memory/memory-service.js";
import { makeAwaitApprovalNode } from "../nodes/await-approval.node.js";

const TENANT_ID   = "tenant-1";
const SESSION_ID  = "session-1";
const USER_ID     = "user-1";
const APPROVAL_ID = "approval-1";

function makeApprovalRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id:           APPROVAL_ID,
    tenant_id:    TENANT_ID,
    session_id:   SESSION_ID,
    action_type:  "source_system_write",
    payload:      {},
    status:       "pending",
    requested_at: new Date(),
    resolved_at:  null,
    resolved_by:  null,
    ...overrides,
  };
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: SESSION_ID, tenant_id: TENANT_ID, user_id: USER_ID,
    role_id: "role-1", state: "AWAITING_APPROVAL", context: {},
    created_at: new Date(), updated_at: new Date(),
    expires_at: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

function makeState(overrides: Partial<AgentGraphState> = {}): AgentGraphState {
  return {
    sessionId:            SESSION_ID,
    tenantId:             TENANT_ID,
    userId:               USER_ID,
    roleId:               "role-1",
    accountApplicationId: "app-1",
    userType:             "admin",
    currentState:         "AWAITING_APPROVAL",
    userMessage:          "Update ticket",
    ipAddress:            "",
    context:              {},
    compiledPrompt:       "[PROMPT]",
    llmResponseText:      "response",
    actionDecision:       "APPROVAL_REQUIRED",
    actionType:           "source_system_write",
    actionPayload:        { issueId: "PROJ-1" },
    approvalId:           "",
    responseText:         "",
    error:                "",
    ...overrides,
  };
}

function makeLock(): jest.Mocked<ApprovalLockHandle> {
  return { release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) };
}

function makeDeps(
  overrides: Partial<AgentDeps> = {},
): { deps: AgentDeps; mocks: ReturnType<typeof buildMocks> } {
  const mocks = buildMocks();
  const deps: AgentDeps = {
    sessionRepo:         mocks.sessionRepo,
    auditService:        mocks.auditService as unknown as AuditService,
    promptCompiler:      { compile: jest.fn() } as unknown as AgentDeps["promptCompiler"],
    acquireApprovalLock: mocks.acquireApprovalLock,
    memoryService: {
      loadAllUserMemory: jest.fn<IMemoryService["loadAllUserMemory"]>().mockResolvedValue({}),
      loadAllRoleMemory: jest.fn<IMemoryService["loadAllRoleMemory"]>().mockResolvedValue({}),
      writeUserMemory:   jest.fn<IMemoryService["writeUserMemory"]>().mockResolvedValue(undefined),
      writeRoleMemory:   jest.fn<IMemoryService["writeRoleMemory"]>().mockResolvedValue(undefined),
    },
    ...overrides,
  };
  return { deps, mocks };
}

function buildMocks() {
  const lock = makeLock();
  const sessionRepo: jest.Mocked<ISessionRepository> = {
    createSession:          jest.fn<ISessionRepository["createSession"]>().mockResolvedValue(makeSessionRow()),
    getSessionById:         jest.fn<ISessionRepository["getSessionById"]>().mockResolvedValue(makeSessionRow()),
    getActiveSessionForUser: jest.fn<ISessionRepository["getActiveSessionForUser"]>().mockResolvedValue(undefined),
    updateSessionState:     jest.fn<ISessionRepository["updateSessionState"]>()
      .mockImplementation((_t, _s, state) => Promise.resolve(makeSessionRow({ state }))),
    createPendingApproval:  jest.fn<ISessionRepository["createPendingApproval"]>()
      .mockResolvedValue(makeApprovalRow()),
    getPendingApproval:     jest.fn<ISessionRepository["getPendingApproval"]>()
      .mockResolvedValue(undefined),
  };
  const auditService = {
    logStateTransition: jest.fn<AuditService["logStateTransition"]>().mockResolvedValue(undefined),
    logEvent:           jest.fn<AuditService["logEvent"]>().mockResolvedValue(undefined),
  };
  const acquireApprovalLock = jest.fn<AgentDeps["acquireApprovalLock"]>().mockResolvedValue(lock);
  return { sessionRepo, auditService, acquireApprovalLock, lock };
}

// ─── Fresh path (no approvalId) ───────────────────────────────────────────────

describe("awaitApprovalNode — fresh path (no approvalId in state)", () => {
  it("acquires the mutex lock using sessionId", async () => {
    const { deps, mocks } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: "" }));

    expect(mocks.acquireApprovalLock).toHaveBeenCalledWith(SESSION_ID);
  });

  it("creates a pending_approval record in DB", async () => {
    const { deps, mocks } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: "" }));

    expect(mocks.sessionRepo.createPendingApproval).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ session_id: SESSION_ID, action_type: "source_system_write" }),
    );
  });

  it("releases the lock after creating the approval record", async () => {
    const { deps, mocks } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: "" }));

    expect(mocks.lock.release).toHaveBeenCalledTimes(1);
  });

  it("returns AWAITING_APPROVAL with the new approvalId (graph suspends)", async () => {
    const { deps } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: "" }));

    expect(result.currentState).toBe("AWAITING_APPROVAL");
    expect(result.approvalId).toBe(APPROVAL_ID);
  });

  it("updates session state to AWAITING_APPROVAL in DB", async () => {
    const { deps, mocks } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: "" }));

    expect(mocks.sessionRepo.updateSessionState).toHaveBeenCalledWith(
      TENANT_ID, SESSION_ID, "AWAITING_APPROVAL",
    );
  });

  it("fires audit log for approval_requested (fire-and-forget)", async () => {
    const { deps, mocks } = makeDeps();
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: "" }));
    await Promise.resolve(); // flush microtasks

    expect(mocks.auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approval_requested" }),
    );
  });

  it("returns FAILED with DUPLICATE_APPROVAL_REQUEST when lock is not acquired", async () => {
    const { deps } = makeDeps({
      acquireApprovalLock: jest.fn<AgentDeps["acquireApprovalLock"]>().mockResolvedValue(null),
    });
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: "" }));

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("DUPLICATE_APPROVAL_REQUEST");
  });

  it("releases lock and returns FAILED when createPendingApproval throws", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.createPendingApproval.mockRejectedValue(new Error("DB_DOWN"));
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: "" }));

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("DB_DOWN");
    expect(mocks.lock.release).toHaveBeenCalledTimes(1);
  });
});

// ─── Resume path (approvalId already in state) ───────────────────────────────

describe("awaitApprovalNode — resume path (approvalId in state)", () => {
  it("proceeds to EXECUTING when approval is approved", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(makeApprovalRow({ status: "approved" }));
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: APPROVAL_ID }));

    expect(result.currentState).toBe("EXECUTING");
  });

  it("logs state transition AWAITING_APPROVAL→EXECUTING when approved", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(makeApprovalRow({ status: "approved" }));
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: APPROVAL_ID }));

    expect(mocks.auditService.logStateTransition).toHaveBeenCalledWith(
      expect.objectContaining({ fromState: "AWAITING_APPROVAL", toState: "EXECUTING" }),
    );
  });

  it("returns FAILED with APPROVAL_REJECTED when approval is rejected", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(makeApprovalRow({ status: "rejected" }));
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: APPROVAL_ID }));

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("APPROVAL_REJECTED");
  });

  it("returns FAILED with APPROVAL_TIMEOUT when pending and 48h elapsed", async () => {
    const { deps, mocks } = makeDeps();
    const expiredAt = new Date(Date.now() - 49 * 60 * 60 * 1_000); // 49h ago
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(
      makeApprovalRow({ status: "pending", requested_at: expiredAt }),
    );
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: APPROVAL_ID }));

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("APPROVAL_TIMEOUT");
  });

  it("stays at AWAITING_APPROVAL when pending and not yet expired", async () => {
    const { deps, mocks } = makeDeps();
    const recentAt = new Date(Date.now() - 1 * 60 * 60 * 1_000); // 1h ago — well within 48h
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(
      makeApprovalRow({ status: "pending", requested_at: recentAt }),
    );
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: APPROVAL_ID }));

    expect(result.currentState).toBe("AWAITING_APPROVAL");
  });

  it("returns FAILED with APPROVAL_RECORD_NOT_FOUND when approval row is missing", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(undefined);
    const node = makeAwaitApprovalNode(deps);
    const result = await node(makeState({ approvalId: APPROVAL_ID }));

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("APPROVAL_RECORD_NOT_FOUND");
  });

  it("does NOT acquire a lock during resume path", async () => {
    const { deps, mocks } = makeDeps();
    mocks.sessionRepo.getPendingApproval.mockResolvedValue(makeApprovalRow({ status: "approved" }));
    const node = makeAwaitApprovalNode(deps);
    await node(makeState({ approvalId: APPROVAL_ID }));

    expect(mocks.acquireApprovalLock).not.toHaveBeenCalled();
  });
});
