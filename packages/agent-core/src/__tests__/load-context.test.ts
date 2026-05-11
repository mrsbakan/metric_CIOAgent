import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AgentDeps, AgentGraphState } from "../types.js";
import type { ISessionRepository } from "../session-repository.js";
import type { AuditService } from "@cio-agent/audit";
import type { SessionRow } from "@cio-agent/db";
import type { IMemoryService } from "../memory/memory-service.js";
import { makeLoadContextNode } from "../nodes/load-context.node.js";

const TENANT_ID  = "tenant-1";
const SESSION_ID = "session-1";
const USER_ID    = "user-1";

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id:         SESSION_ID,
    tenant_id:  TENANT_ID,
    user_id:    USER_ID,
    role_id:    "role-1",
    state:      "CONTEXT_LOADED",
    context:    {},
    created_at: new Date(),
    updated_at: new Date(),
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
    currentState:         "CONTEXT_LOADED",
    userMessage:          "list sprints",
    ipAddress:            "",
    context:              {},
    compiledPrompt:       "",
    llmResponseText:      "",
    actionDecision:       "NA",
    actionType:           "",
    actionPayload:        {},
    approvalId:           "",
    responseText:         "",
    error:                "",
    ...overrides,
  };
}

// Pass null explicitly to simulate "session not found" (undefined as default arg is ignored by JS)
function makeDeps(sessionRow: SessionRow | null = makeSessionRow()): {
  deps: AgentDeps;
  mockRepo: jest.Mocked<ISessionRepository>;
  mockAudit: { logStateTransition: jest.MockedFunction<AuditService["logStateTransition"]>; logEvent: jest.MockedFunction<AuditService["logEvent"]> };
} {
  const mockRepo: jest.Mocked<ISessionRepository> = {
    createSession:          jest.fn<ISessionRepository["createSession"]>(),
    getSessionById:         jest.fn<ISessionRepository["getSessionById"]>()
      .mockResolvedValue(sessionRow ?? undefined),
    getActiveSessionForUser: jest.fn<ISessionRepository["getActiveSessionForUser"]>().mockResolvedValue(undefined),
    updateSessionState:     jest.fn<ISessionRepository["updateSessionState"]>()
      .mockImplementation((_t, _s, state) => Promise.resolve(makeSessionRow({ state }))),
    createPendingApproval:  jest.fn<ISessionRepository["createPendingApproval"]>(),
    getPendingApproval:     jest.fn<ISessionRepository["getPendingApproval"]>().mockResolvedValue(undefined),
  };
  const mockAudit = {
    logStateTransition: jest.fn<AuditService["logStateTransition"]>().mockResolvedValue(undefined),
    logEvent:           jest.fn<AuditService["logEvent"]>().mockResolvedValue(undefined),
  };
  const deps: AgentDeps = {
    sessionRepo:         mockRepo,
    auditService:        mockAudit as unknown as AuditService,
    promptCompiler:      { compile: jest.fn() } as unknown as AgentDeps["promptCompiler"],
    acquireApprovalLock: jest.fn<AgentDeps["acquireApprovalLock"]>(),
    memoryService: {
      loadAllUserMemory: jest.fn<IMemoryService["loadAllUserMemory"]>().mockResolvedValue({}),
      loadAllRoleMemory: jest.fn<IMemoryService["loadAllRoleMemory"]>().mockResolvedValue({}),
      writeUserMemory:   jest.fn<IMemoryService["writeUserMemory"]>().mockResolvedValue(undefined),
      writeRoleMemory:   jest.fn<IMemoryService["writeRoleMemory"]>().mockResolvedValue(undefined),
    },
  };
  return { deps, mockRepo, mockAudit };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("loadContextNode — happy path", () => {
  it("loads the session from DB using tenantId + sessionId", async () => {
    const { deps, mockRepo } = makeDeps();
    const node = makeLoadContextNode(deps);
    await node(makeState());

    expect(mockRepo.getSessionById).toHaveBeenCalledWith(TENANT_ID, SESSION_ID);
  });

  it("restores context from DB session row into graph state", async () => {
    const ctx = { sprintId: "sprint-42", board: "PROJ" };
    const { deps } = makeDeps(makeSessionRow({ context: ctx }));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.context).toEqual({ ...ctx, userMemory: {}, roleMemory: {} });
  });

  it("returns empty context when session.context is empty object", async () => {
    const { deps } = makeDeps(makeSessionRow({ context: {} }));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.context).toEqual({ userMemory: {}, roleMemory: {} });
  });

  it("transitions to PROMPT_COMPILED", async () => {
    const { deps } = makeDeps();
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("PROMPT_COMPILED");
  });

  it("persists context to DB via updateSessionState", async () => {
    const ctx = { key: "value" };
    const { deps, mockRepo } = makeDeps(makeSessionRow({ context: ctx }));
    const node = makeLoadContextNode(deps);
    await node(makeState());

    expect(mockRepo.updateSessionState).toHaveBeenCalledWith(
      TENANT_ID, SESSION_ID, "PROMPT_COMPILED", { ...ctx, userMemory: {}, roleMemory: {} },
    );
  });

  it("logs CONTEXT_LOADED → PROMPT_COMPILED state transition", async () => {
    const { deps, mockAudit } = makeDeps();
    const node = makeLoadContextNode(deps);
    await node(makeState());

    expect(mockAudit.logStateTransition).toHaveBeenCalledWith(
      expect.objectContaining({ fromState: "CONTEXT_LOADED", toState: "PROMPT_COMPILED" }),
    );
  });
});

// ─── Isolation enforcement ────────────────────────────────────────────────────

describe("loadContextNode — session isolation enforcement", () => {
  it("returns FAILED with SESSION_NOT_FOUND when getSessionById returns undefined", async () => {
    const { deps } = makeDeps(null);
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("SESSION_NOT_FOUND");
  });

  it("returns FAILED with SESSION_TENANT_MISMATCH when tenant_id does not match", async () => {
    const { deps } = makeDeps(makeSessionRow({ tenant_id: "other-tenant" }));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("SESSION_TENANT_MISMATCH");
  });

  it("returns FAILED with SESSION_USER_MISMATCH when user_id does not match", async () => {
    const { deps } = makeDeps(makeSessionRow({ user_id: "other-user" }));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("SESSION_USER_MISMATCH");
  });

  it("does not proceed to PROMPT_COMPILED on isolation failure", async () => {
    const { deps } = makeDeps(makeSessionRow({ tenant_id: "other-tenant" }));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.currentState).not.toBe("PROMPT_COMPILED");
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("loadContextNode — error handling", () => {
  it("returns FAILED when getSessionById throws", async () => {
    const { deps, mockRepo } = makeDeps();
    mockRepo.getSessionById.mockRejectedValue(new Error("DB_READ_FAIL"));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("DB_READ_FAIL");
  });

  it("returns FAILED when updateSessionState throws", async () => {
    const { deps, mockRepo } = makeDeps();
    mockRepo.updateSessionState.mockRejectedValue(new Error("DB_WRITE_FAIL"));
    const node = makeLoadContextNode(deps);
    const result = await node(makeState());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("DB_WRITE_FAIL");
  });
});
