import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { Test } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { ApprovalsService } from "./approvals.service.js";
import type { AgentRunner } from "@cio-agent/agent-core";
import type { TenantContext } from "@cio-agent/shared/types";

// ── Mock @cio-agent/db ───────────────────────────────────────────────────────

const mockGetApprovals  = jest.fn<(...a: unknown[]) => unknown>();
const mockResolve       = jest.fn<(...a: unknown[]) => unknown>();

jest.mock("@cio-agent/db", () => ({
  getApprovalsByTenant: (db: unknown, tid: unknown, status: unknown) => mockGetApprovals(db, tid, status),
  resolveApprovalInDb:  (db: unknown, id: unknown, params: unknown)  => mockResolve(db, id, params),
  pendingApprovals:     { id: "id", tenant_id: "tenant_id", status: "status" },
}));

jest.mock("@cio-agent/db/schema", () => ({
  pendingApprovals: {
    id:        "id",
    tenant_id: "tenant_id",
    status:    "status",
  },
}));

// ── Mock withRls ─────────────────────────────────────────────────────────────

jest.mock("../common/db/with-rls.js", () => ({
  withRls: (_db: unknown, _tid: unknown, fn: (tx: unknown) => unknown) => fn({ select: () => ({ from: () => ({ where: () => ({ limit: () => [mockApprovalRow] }) }) }) }),
}));

const TENANT_ID   = "tenant-1";
const USER_ID     = "user-1";
const ROLE_ID     = "role-1";
const APP_ID      = "app-1";
const SESSION_ID  = "session-1";
const APPROVAL_ID = "approval-1";

let mockApprovalRow: Record<string, unknown>;

const ctx: TenantContext = {
  tenant_id:              TENANT_ID,
  user_id:                USER_ID,
  role_id:                ROLE_ID,
  user_type:              "admin",
  account_application_id: APP_ID,
};

function makeApprovalRow(overrides: Partial<Record<string, unknown>> = {}) {
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

describe("ApprovalsService", () => {
  let service: ApprovalsService;
  let mockRunner: jest.Mocked<Pick<AgentRunner, "resume">>;

  beforeEach(async () => {
    mockApprovalRow = makeApprovalRow();
    mockRunner      = { resume: jest.fn<AgentRunner["resume"]>() };

    const module = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: "DB",           useValue: {} },
        { provide: "AGENT_RUNNER", useValue: mockRunner },
      ],
    }).compile();

    service = module.get(ApprovalsService);
  });

  // ── list ──────────────────────────────────────────────────────────────────

  it("list() delegates to getApprovalsByTenant", async () => {
    mockGetApprovals.mockResolvedValue([makeApprovalRow()] as never);
    const result = await service.list(ctx, {});
    expect(mockGetApprovals).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("list() passes status filter through", async () => {
    mockGetApprovals.mockResolvedValue([] as never);
    await service.list(ctx, { status: "pending" });
    expect(mockGetApprovals).toHaveBeenCalledWith(expect.anything(), TENANT_ID, "pending");
  });

  // ── approve ───────────────────────────────────────────────────────────────

  it("approve() resolves approval as approved in DB", async () => {
    mockResolve.mockResolvedValue(makeApprovalRow({ status: "approved" }) as never);
    mockRunner.resume.mockResolvedValue({
      sessionId: SESSION_ID, state: "COMPLETED", responseText: "Done.",
      actionDraft: null, error: null,
    });

    await service.approve(ctx, APPROVAL_ID);

    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      APPROVAL_ID,
      expect.objectContaining({ status: "approved", resolvedBy: USER_ID }),
    );
  });

  it("approve() calls AgentRunner.resume() with correct params", async () => {
    mockResolve.mockResolvedValue(makeApprovalRow({ status: "approved" }) as never);
    mockRunner.resume.mockResolvedValue({
      sessionId: SESSION_ID, state: "COMPLETED", responseText: "Done.",
      actionDraft: null, error: null,
    });

    await service.approve(ctx, APPROVAL_ID);

    expect(mockRunner.resume).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId:   TENANT_ID,
        userId:     USER_ID,
        sessionId:  SESSION_ID,
        approvalId: APPROVAL_ID,
      }),
    );
  });

  it("approve() throws NotFoundException when approval does not exist", async () => {
    mockApprovalRow = undefined as unknown as Record<string, unknown>;
    await expect(service.approve(ctx, APPROVAL_ID)).rejects.toThrow(NotFoundException);
  });

  it("approve() throws ForbiddenException when approval is not pending", async () => {
    mockApprovalRow = makeApprovalRow({ status: "approved" });
    await expect(service.approve(ctx, APPROVAL_ID)).rejects.toThrow(ForbiddenException);
  });

  // ── reject ────────────────────────────────────────────────────────────────

  it("reject() resolves approval as rejected in DB", async () => {
    mockResolve.mockResolvedValue(makeApprovalRow({ status: "rejected" }) as never);
    await service.reject(ctx, APPROVAL_ID);

    expect(mockResolve).toHaveBeenCalledWith(
      expect.anything(),
      APPROVAL_ID,
      expect.objectContaining({ status: "rejected", resolvedBy: USER_ID }),
    );
  });

  it("reject() does NOT call AgentRunner.resume()", async () => {
    mockResolve.mockResolvedValue(makeApprovalRow({ status: "rejected" }) as never);
    await service.reject(ctx, APPROVAL_ID);
    expect(mockRunner.resume).not.toHaveBeenCalled();
  });
});
