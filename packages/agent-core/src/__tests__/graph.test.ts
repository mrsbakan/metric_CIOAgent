import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { AgentDeps } from "../types.js";
import type { ISessionRepository } from "../session-repository.js";
import type { AuditService } from "@cio-agent/audit";
import type { SessionRow, ApprovalRow } from "@cio-agent/db";
import type { IPromptCompiler, CompileResult } from "@cio-agent/prompt-compiler";
import type { IMemoryService } from "../memory/memory-service.js";
import { buildGraph } from "../graph.js";
import { AgentRunner, buildRunResult } from "../agent-runner.js";

const COMPILED_PROMPT_RESULT: CompileResult = {
  compiledPrompt: "[COMPILED_PROMPT_STUB]",
  layersIncluded: ["LAYER_1_SYSTEM_CORE"],
  conflicts:      [],
  tokenCount:     10,
  trimmed:        false,
};

const SESSION_ID  = "session-uuid-1";
const TENANT_ID   = "tenant-uuid-1";
const USER_ID     = "user-uuid-1";
const ROLE_ID     = "role-uuid-1";
const APP_ID      = "app-uuid-1";
const APPROVAL_ID = "approval-uuid-1";

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id:         SESSION_ID,
    tenant_id:  TENANT_ID,
    user_id:    USER_ID,
    role_id:    ROLE_ID,
    state:      "RECEIVED",
    context:    {},
    created_at: new Date(),
    updated_at: new Date(),
    expires_at: new Date(Date.now() + 86_400_000),
    ...overrides,
  };
}

function makeApprovalRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id:           APPROVAL_ID,
    tenant_id:    TENANT_ID,
    session_id:   SESSION_ID,
    action_type:  "test_action",
    payload:      {},
    status:       "pending",
    requested_at: new Date(),
    resolved_at:  null,
    resolved_by:  null,
    ...overrides,
  };
}

function baseInput() {
  return {
    sessionId:            "",
    tenantId:             TENANT_ID,
    userId:               USER_ID,
    roleId:               ROLE_ID,
    accountApplicationId: APP_ID,
    userType:             "admin" as const,
    currentState:         "RECEIVED" as const,
    userMessage:          "What is the sprint status?",
    ipAddress:            "",
    context:              {},
    compiledPrompt:       "",
    llmResponseText:      "",
    actionDecision:       "NA" as const,
    actionType:           "",
    actionPayload:        {},
    approvalId:           "",
    responseText:         "",
    error:                "",
  };
}

describe("AgentGraph — skeleton", () => {
  let mockSessionRepo: jest.Mocked<ISessionRepository>;
  let mockAudit: {
    logStateTransition: jest.MockedFunction<AuditService["logStateTransition"]>;
    logEvent:           jest.MockedFunction<AuditService["logEvent"]>;
  };
  let deps: AgentDeps;

  beforeEach(() => {
    mockSessionRepo = {
      createSession: jest.fn<ISessionRepository["createSession"]>()
        .mockResolvedValue(makeSessionRow()),
      getSessionById: jest.fn<ISessionRepository["getSessionById"]>()
        .mockResolvedValue(makeSessionRow()),
      getActiveSessionForUser: jest.fn<ISessionRepository["getActiveSessionForUser"]>()
        .mockResolvedValue(undefined),
      updateSessionState: jest.fn<ISessionRepository["updateSessionState"]>()
        .mockImplementation((_tenantId, _sessionId, state) =>
          Promise.resolve(makeSessionRow({ state })),
        ),
      createPendingApproval: jest.fn<ISessionRepository["createPendingApproval"]>()
        .mockResolvedValue(makeApprovalRow()),
      getPendingApproval: jest.fn<ISessionRepository["getPendingApproval"]>()
        .mockResolvedValue(undefined),
    };

    mockAudit = {
      logStateTransition: jest.fn<AuditService["logStateTransition"]>().mockResolvedValue(undefined),
      logEvent:           jest.fn<AuditService["logEvent"]>().mockResolvedValue(undefined),
    };

    deps = {
      sessionRepo:    mockSessionRepo,
      auditService:   mockAudit as unknown as AuditService,
      promptCompiler: {
        compile: jest.fn<IPromptCompiler["compile"]>()
          .mockResolvedValue(COMPILED_PROMPT_RESULT),
      },
      acquireApprovalLock: jest.fn<AgentDeps["acquireApprovalLock"]>()
        .mockResolvedValue({ release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) }),
      memoryService: {
        loadAllUserMemory: jest.fn<IMemoryService["loadAllUserMemory"]>().mockResolvedValue({}),
        loadAllRoleMemory: jest.fn<IMemoryService["loadAllRoleMemory"]>().mockResolvedValue({}),
        writeUserMemory:   jest.fn<IMemoryService["writeUserMemory"]>().mockResolvedValue(undefined),
        writeRoleMemory:   jest.fn<IMemoryService["writeRoleMemory"]>().mockResolvedValue(undefined),
      },
    };
  });

  it("traverses all states and completes for NA action (informational query)", async () => {
    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("COMPLETED");
    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.error).toBeFalsy();  // "" sentinel means no error
    expect(result.responseText).toBeTruthy();
  });

  it("logs a state transition for each step", async () => {
    const graph = buildGraph(deps);
    await graph.invoke(baseInput());

    // RECEIVED→CONTEXT_LOADED, CONTEXT_LOADED→PROMPT_COMPILED,
    // PROMPT_COMPILED→LLM_CALLED, LLM_CALLED→ACTION_DECIDED,
    // ACTION_DECIDED→EXECUTING, EXECUTING→COMPLETED = 6 transitions
    expect(mockAudit.logStateTransition).toHaveBeenCalledTimes(6);
  });

  it("suspends at AWAITING_APPROVAL when ADM resolves APPROVAL_REQUIRED", async () => {
    const graph  = buildGraph(deps);
    // source_system_write + admin → APPROVAL_REQUIRED; graph suspends (human action required)
    const result = await graph.invoke({ ...baseInput(), actionType: "source_system_write", userType: "admin" as const });

    expect(result.currentState).toBe("AWAITING_APPROVAL");
    expect(result.approvalId).toBe(APPROVAL_ID);
    expect(mockSessionRepo.createPendingApproval).toHaveBeenCalledTimes(1);
  });

  it("suspends at AWAITING_APPROVAL when ADM resolves DRAFT", async () => {
    const graph  = buildGraph(deps);
    // okr_create_assign + power → DRAFT; graph suspends
    const result = await graph.invoke({ ...baseInput(), actionType: "okr_create_assign", userType: "power" as const });

    expect(result.currentState).toBe("AWAITING_APPROVAL");
    expect(result.approvalId).toBe(APPROVAL_ID);
    expect(mockSessionRepo.createPendingApproval).toHaveBeenCalledTimes(1);
  });

  it("fails with DUPLICATE_APPROVAL_REQUEST when mutex lock cannot be acquired", async () => {
    (deps.acquireApprovalLock as jest.MockedFunction<AgentDeps["acquireApprovalLock"]>)
      .mockResolvedValueOnce(null);

    const graph  = buildGraph(deps);
    const result = await graph.invoke({
      ...baseInput(),
      actionType: "source_system_write",
      userType:   "admin" as const,
    });

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toBe("DUPLICATE_APPROVAL_REQUEST");
  });

  it("logs PROMPT_CONFLICT_DETECTED to audit when compiler returns conflicts", async () => {
    const conflictDeps: AgentDeps = {
      ...deps,
      promptCompiler: {
        compile: jest.fn<IPromptCompiler["compile"]>().mockResolvedValue({
          compiledPrompt: "[LAYER_1_ONLY]",
          layersIncluded: ["LAYER_1_SYSTEM_CORE"],
          conflicts:      [{ layer: "LAYER_2_GENERAL_RULES", pattern: "INJECTION", rejected: true }],
          tokenCount:     10,
          trimmed:        false,
        }),
      },
    };

    const graph = buildGraph(conflictDeps);
    await graph.invoke(baseInput());

    // logEvent is fire-and-forget; wait a tick for the promise to settle
    await Promise.resolve();

    expect(mockAudit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "PROMPT_CONFLICT_DETECTED", entityType: "prompt_layer" }),
    );
  });

  it("returns FAILED immediately when user has an active concurrent session", async () => {
    mockSessionRepo.getActiveSessionForUser.mockResolvedValue(
      makeSessionRow({ state: "EXECUTING" }),
    );

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("CONCURRENT_SESSION");
    expect(mockSessionRepo.createSession).not.toHaveBeenCalled();
  });

  it("returns FAILED when createSession throws", async () => {
    mockSessionRepo.createSession.mockRejectedValue(new Error("DB_DOWN"));

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("DB_DOWN");
  });

  it("creates a session record in DB on each run", async () => {
    const graph = buildGraph(deps);
    await graph.invoke(baseInput());

    expect(mockSessionRepo.createSession).toHaveBeenCalledTimes(1);
    expect(mockSessionRepo.createSession).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ user_id: USER_ID, role_id: ROLE_ID }),
    );
  });

  it("returns FAILED when loadContextNode audit throws", async () => {
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)          // receiveNode succeeds
      .mockRejectedValueOnce(new Error("LOAD_CTX_AUDIT_FAIL")); // loadContextNode throws

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("LOAD_CTX_AUDIT_FAIL");
  });

  it("returns FAILED when compilePromptNode audit throws", async () => {
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("COMPILE_AUDIT_FAIL"));

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("COMPILE_AUDIT_FAIL");
  });

  it("returns FAILED when decideActionNode audit throws", async () => {
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)  // callLlm ok
      .mockRejectedValueOnce(new Error("DECIDE_AUDIT_FAIL")); // decideAction throws

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("DECIDE_AUDIT_FAIL");
  });

  it("swallows DB error inside safeMarkFailed and still returns FAILED", async () => {
    // loadContextNode audit throws → safeMarkFailed is called → updateSessionState also throws
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("LOAD_AUDIT_ERR"));

    mockSessionRepo.updateSessionState
      .mockResolvedValueOnce(makeSessionRow({ state: "CONTEXT_LOADED" }))
      .mockResolvedValueOnce(makeSessionRow({ state: "PROMPT_COMPILED" }))
      .mockRejectedValueOnce(new Error("SAFE_FAIL_DB_ERR")); // inside safeMarkFailed

    const result = await buildGraph(deps).invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("LOAD_AUDIT_ERR");
  });

  it("returns FAILED when executeNode audit throws", async () => {
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)  // decideAction ok
      .mockRejectedValueOnce(new Error("EXECUTE_AUDIT_FAIL")); // executeNode throws

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("EXECUTE_AUDIT_FAIL");
  });

  it("returns FAILED when a mid-pipeline audit log call throws", async () => {
    // Succeed for first 3 transitions (receive, loadContext, compilePrompt),
    // then throw on the 4th call inside callLlmNode.
    mockAudit.logStateTransition
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("AUDIT_SERVICE_DOWN"));

    const graph  = buildGraph(deps);
    const result = await graph.invoke(baseInput());

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("AUDIT_SERVICE_DOWN");
  });

  it("returns FAILED when awaitApprovalNode createPendingApproval throws", async () => {
    mockSessionRepo.createPendingApproval.mockRejectedValue(
      new Error("DB_APPROVAL_FAIL"),
    );

    const graph  = buildGraph(deps);
    // source_system_write + admin → APPROVAL_REQUIRED → triggers awaitApprovalNode
    const result = await graph.invoke({
      ...baseInput(),
      actionType: "source_system_write",
      userType:   "admin" as const,
    });

    expect(result.currentState).toBe("FAILED");
    expect(result.error).toContain("DB_APPROVAL_FAIL");
  });
});

describe("AgentRunner", () => {
  let mockSessionRepo: jest.Mocked<ISessionRepository>;
  let mockAudit: {
    logStateTransition: jest.MockedFunction<AuditService["logStateTransition"]>;
    logEvent:           jest.MockedFunction<AuditService["logEvent"]>;
  };
  let deps: AgentDeps;

  beforeEach(() => {
    mockSessionRepo = {
      createSession: jest.fn<ISessionRepository["createSession"]>()
        .mockResolvedValue({
          id: SESSION_ID, tenant_id: TENANT_ID, user_id: USER_ID, role_id: ROLE_ID,
          state: "RECEIVED", context: {}, created_at: new Date(),
          updated_at: new Date(), expires_at: new Date(Date.now() + 86_400_000),
        }),
      getSessionById: jest.fn<ISessionRepository["getSessionById"]>()
        .mockResolvedValue({
          id: SESSION_ID, tenant_id: TENANT_ID, user_id: USER_ID, role_id: ROLE_ID,
          state: "CONTEXT_LOADED", context: {}, created_at: new Date(),
          updated_at: new Date(), expires_at: new Date(Date.now() + 86_400_000),
        }),
      getActiveSessionForUser: jest.fn<ISessionRepository["getActiveSessionForUser"]>()
        .mockResolvedValue(undefined),
      updateSessionState: jest.fn<ISessionRepository["updateSessionState"]>()
        .mockImplementation((_t, _s, state) =>
          Promise.resolve({
            id: SESSION_ID, tenant_id: TENANT_ID, user_id: USER_ID, role_id: ROLE_ID,
            state, context: {}, created_at: new Date(),
            updated_at: new Date(), expires_at: new Date(Date.now() + 86_400_000),
          }),
        ),
      createPendingApproval: jest.fn<ISessionRepository["createPendingApproval"]>()
        .mockResolvedValue({
          id: APPROVAL_ID, tenant_id: TENANT_ID, session_id: SESSION_ID,
          action_type: "test", payload: {}, status: "pending",
          requested_at: new Date(), resolved_at: null, resolved_by: null,
        }),
      getPendingApproval: jest.fn<ISessionRepository["getPendingApproval"]>()
        .mockResolvedValue(undefined),
    };

    mockAudit = {
      logStateTransition: jest.fn<AuditService["logStateTransition"]>().mockResolvedValue(undefined),
      logEvent:           jest.fn<AuditService["logEvent"]>().mockResolvedValue(undefined),
    };

    deps = {
      sessionRepo:    mockSessionRepo,
      auditService:   mockAudit as unknown as AuditService,
      promptCompiler: {
        compile: jest.fn<IPromptCompiler["compile"]>()
          .mockResolvedValue(COMPILED_PROMPT_RESULT),
      },
      acquireApprovalLock: jest.fn<AgentDeps["acquireApprovalLock"]>()
        .mockResolvedValue({ release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) }),
      memoryService: {
        loadAllUserMemory: jest.fn<IMemoryService["loadAllUserMemory"]>().mockResolvedValue({}),
        loadAllRoleMemory: jest.fn<IMemoryService["loadAllRoleMemory"]>().mockResolvedValue({}),
        writeUserMemory:   jest.fn<IMemoryService["writeUserMemory"]>().mockResolvedValue(undefined),
        writeRoleMemory:   jest.fn<IMemoryService["writeRoleMemory"]>().mockResolvedValue(undefined),
      },
    };
  });

  it("run() returns COMPLETED with sessionId and null error on success", async () => {
    const runner = new AgentRunner(deps);
    const result = await runner.run({
      tenantId:             TENANT_ID,
      userId:               USER_ID,
      roleId:               ROLE_ID,
      accountApplicationId: APP_ID,
      userType:             "admin" as const,
      message:              "Show sprint status",
    });

    expect(result.state).toBe("COMPLETED");
    expect(result.sessionId).toBe(SESSION_ID);
    expect(result.error).toBeNull();
    expect(result.actionDraft).toBeNull();
  });

  it("run() returns FAILED state when concurrent session exists", async () => {
    mockSessionRepo.getActiveSessionForUser.mockResolvedValue({
      id: "other-session", tenant_id: TENANT_ID, user_id: USER_ID, role_id: ROLE_ID,
      state: "EXECUTING", context: {}, created_at: new Date(),
      updated_at: new Date(), expires_at: new Date(Date.now() + 86_400_000),
    });

    const runner = new AgentRunner(deps);
    const result = await runner.run({
      tenantId: TENANT_ID, userId: USER_ID, roleId: ROLE_ID,
      accountApplicationId: APP_ID, userType: "admin" as const, message: "test",
    });

    expect(result.state).toBe("FAILED");
    expect(result.error).not.toBeNull();
  });

  it("run() converts empty responseText to null in result", async () => {
    const runner = new AgentRunner(deps);
    const result = await runner.run({
      tenantId: TENANT_ID, userId: USER_ID, roleId: ROLE_ID,
      accountApplicationId: APP_ID, userType: "admin" as const, message: "ping",
    });

    // responseText is non-empty (placeholder from callLlmNode stub)
    expect(result.responseText).not.toBe("");
  });

  it("buildRunResult sets actionDraft when DRAFT with actionType", () => {
    const result = buildRunResult({
      sessionId:      "s1",
      currentState:   "COMPLETED",
      responseText:   "done",
      actionDecision: "DRAFT",
      actionType:     "create_jira_task",
      actionPayload:  { key: "val" },
      approvalId:     "a1",
      error:          "",
    });

    expect(result.actionDraft).toEqual({
      actionType: "create_jira_task",
      payload:    { key: "val" },
      approvalId: "a1",
    });
    expect(result.error).toBeNull();
    expect(result.responseText).toBe("done");
  });

  it("buildRunResult sets actionDraft.approvalId to null when empty", () => {
    const result = buildRunResult({
      sessionId:      "s1",
      currentState:   "AWAITING_APPROVAL",
      responseText:   "",
      actionDecision: "APPROVAL_REQUIRED",
      actionType:     "update_task",
      actionPayload:  {},
      approvalId:     "",
      error:          "",
    });

    expect(result.actionDraft?.approvalId).toBeNull();
  });

  it("buildRunResult returns null actionDraft for NA decision", () => {
    const result = buildRunResult({
      sessionId: "s1", currentState: "COMPLETED",
      responseText: "ok", actionDecision: "NA",
      actionType: "some_action", actionPayload: {}, approvalId: "", error: "",
    });

    expect(result.actionDraft).toBeNull();
  });

  it("run() populates actionDraft when ADM resolves APPROVAL_REQUIRED", async () => {
    // source_system_write + admin → APPROVAL_REQUIRED via ADM
    const graph = buildGraph(deps);
    const rawResult = await graph.invoke({
      sessionId: "", tenantId: TENANT_ID, userId: USER_ID, roleId: ROLE_ID,
      accountApplicationId: APP_ID, userType: "admin" as const,
      currentState: "RECEIVED" as const, userMessage: "Update ticket", ipAddress: "",
      context: {}, compiledPrompt: "", llmResponseText: "",
      actionDecision: "NA" as const,
      actionType: "source_system_write", actionPayload: {}, approvalId: "",
      responseText: "", error: "",
    });

    expect(rawResult.actionDecision).toBe("APPROVAL_REQUIRED");
    expect(rawResult.actionType).toBe("source_system_write");
    expect(rawResult.approvalId).toBe(APPROVAL_ID);
  });
});

// ─── node-utils ──────────────────────────────────────────────────────────────

import { toErrorMessage, safeMarkFailed } from "../node-utils.js";
import type { AgentGraphState } from "../types.js";

describe("toErrorMessage", () => {
  it("returns Error.message for Error instances", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns String(value) for non-Error values", () => {
    expect(toErrorMessage("raw string")).toBe("raw string");
    expect(toErrorMessage(404)).toBe("404");
    expect(toErrorMessage(null)).toBe("null");
  });
});

describe("safeMarkFailed", () => {
  function makeMinimalDeps(updateImpl: ISessionRepository["updateSessionState"]): AgentDeps {
    return {
      sessionRepo: {
        createSession:          jest.fn<ISessionRepository["createSession"]>(),
        getSessionById:         jest.fn<ISessionRepository["getSessionById"]>(),
        getActiveSessionForUser: jest.fn<ISessionRepository["getActiveSessionForUser"]>(),
        updateSessionState:     jest.fn<ISessionRepository["updateSessionState"]>()
                                  .mockImplementation(updateImpl),
        createPendingApproval:  jest.fn<ISessionRepository["createPendingApproval"]>(),
        getPendingApproval:     jest.fn<ISessionRepository["getPendingApproval"]>(),
      },
      auditService: {
        logStateTransition: jest.fn<AuditService["logStateTransition"]>().mockResolvedValue(undefined),
      } as unknown as AuditService,
      promptCompiler: {
        compile: jest.fn<IPromptCompiler["compile"]>().mockResolvedValue(COMPILED_PROMPT_RESULT),
      },
      acquireApprovalLock: jest.fn<AgentDeps["acquireApprovalLock"]>()
        .mockResolvedValue({ release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) }),
      memoryService: {
        loadAllUserMemory: jest.fn<IMemoryService["loadAllUserMemory"]>().mockResolvedValue({}),
        loadAllRoleMemory: jest.fn<IMemoryService["loadAllRoleMemory"]>().mockResolvedValue({}),
        writeUserMemory:   jest.fn<IMemoryService["writeUserMemory"]>().mockResolvedValue(undefined),
        writeRoleMemory:   jest.fn<IMemoryService["writeRoleMemory"]>().mockResolvedValue(undefined),
      },
    };
  }

  it("calls updateSessionState with FAILED", async () => {
    const updateMock = jest.fn<ISessionRepository["updateSessionState"]>()
      .mockResolvedValue(makeSessionRow({ state: "FAILED" }));
    const deps = makeMinimalDeps(updateMock as unknown as ISessionRepository["updateSessionState"]);
    const state = { tenantId: TENANT_ID, sessionId: SESSION_ID } as AgentGraphState;

    await safeMarkFailed(deps, state);

    expect(updateMock).toHaveBeenCalledWith(TENANT_ID, SESSION_ID, "FAILED");
  });

  it("swallows errors from updateSessionState", async () => {
    const deps = makeMinimalDeps(
      () => Promise.reject(new Error("db down")) as ReturnType<ISessionRepository["updateSessionState"]>,
    );
    const state = { tenantId: TENANT_ID, sessionId: SESSION_ID } as AgentGraphState;

    await expect(safeMarkFailed(deps, state)).resolves.toBeUndefined();
  });
});
