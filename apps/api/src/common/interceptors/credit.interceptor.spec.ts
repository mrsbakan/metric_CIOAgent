import { Test } from "@nestjs/testing";
import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { of, throwError } from "rxjs";
import { CREDIT_COST_KEY } from "../decorators/credit-cost.decorator.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDeduct   = jest.fn<() => Promise<{ remaining: number }>>();
const mockLogEvent = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockCreditService = { deduct:   mockDeduct };
const mockAuditService  = { logEvent: mockLogEvent };

const TENANT_CTX = {
  user_id:                "user-1",
  tenant_id:              "tenant-1",
  role_id:                "role-1",
  user_type:              "admin" as const,
  account_application_id: "app-1",
};

function makeContext(cost: number | undefined, overrides?: Partial<typeof TENANT_CTX>): ExecutionContext {
  const reflector = new Reflector();
  jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(cost as never);

  return {
    getHandler: jest.fn(),
    getClass:   jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        tenantContext: { ...TENANT_CTX, ...overrides },
        method: "POST",
        path: "/v1/chat",
        route: { path: "/v1/chat" },
      }),
    }),
  } as unknown as ExecutionContext;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CreditInterceptor", () => {
  let interceptor: import("./credit.interceptor.js").CreditInterceptor;
  let reflector: Reflector;

  beforeEach(async () => {
    jest.clearAllMocks();

    reflector = new Reflector();

    const module = await Test.createTestingModule({
      providers: [
        { provide: Reflector,         useValue: reflector },
        { provide: "CREDIT_SERVICE",  useValue: mockCreditService },
        { provide: "AUDIT_SERVICE",   useValue: mockAuditService },
        (await import("./credit.interceptor.js")).CreditInterceptor,
      ],
    }).compile();

    interceptor = module.get(
      (await import("./credit.interceptor.js")).CreditInterceptor,
    );
  });

  it("passes through without deducting when no @CreditCost set", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(undefined as never);
    const ctx  = makeContext(undefined);
    const next = { handle: jest.fn().mockReturnValue(of({ data: "ok" })) };

    interceptor.intercept(ctx, next as never).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: "ok" });
        expect(mockDeduct).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it("deducts credits and passes response through on success", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(5 as never);
    mockDeduct.mockResolvedValue({ remaining: 95 });
    const ctx  = makeContext(5);
    const next = { handle: jest.fn().mockReturnValue(of({ data: "ok" })) };

    interceptor.intercept(ctx, next as never).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: "ok" });
        expect(mockDeduct).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId:             "tenant-1",
            accountApplicationId: "app-1",
            amount:               5,
          }),
        );
        done();
      },
    });
  });

  it("returns 402 when deduction fails with INSUFFICIENT_CREDITS", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(10 as never);
    const err = Object.assign(new Error("Insufficient credits"), { code: "INSUFFICIENT_CREDITS" });
    mockDeduct.mockRejectedValue(err);
    const ctx  = makeContext(10);
    const next = { handle: jest.fn().mockReturnValue(of({})) };

    interceptor.intercept(ctx, next as never).subscribe({
      error: (e: unknown) => {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
        done();
      },
    });
  });

  it("logs credit_consumed event after successful response", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(3 as never);
    mockDeduct.mockResolvedValue({ remaining: 97 });
    const ctx  = makeContext(3);
    const next = { handle: jest.fn().mockReturnValue(of({})) };

    interceptor.intercept(ctx, next as never).subscribe({
      complete: () => {
        // logEvent is fire-and-forget (void), wait one microtask
        setImmediate(() => {
          expect(mockLogEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "credit_consumed" }),
          );
          done();
        });
      },
    });
  });

  it("logs credit_exhausted event and returns 402 on insufficient credits", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(10 as never);
    const err = Object.assign(new Error("Insufficient credits"), { code: "INSUFFICIENT_CREDITS" });
    mockDeduct.mockRejectedValue(err);
    const ctx  = makeContext(10);
    const next = { handle: jest.fn().mockReturnValue(of({})) };

    interceptor.intercept(ctx, next as never).subscribe({
      error: () => {
        setImmediate(() => {
          expect(mockLogEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventType: "credit_exhausted" }),
          );
          done();
        });
      },
    });
  });

  it("re-throws unknown errors without wrapping in HttpException", (done) => {
    jest.spyOn(reflector, "getAllAndOverride").mockReturnValue(5 as never);
    mockDeduct.mockRejectedValue(new Error("DB connection lost"));
    const ctx  = makeContext(5);
    const next = { handle: jest.fn().mockReturnValue(of({})) };

    interceptor.intercept(ctx, next as never).subscribe({
      error: (e: unknown) => {
        expect(e).toBeInstanceOf(Error);
        expect(e).not.toBeInstanceOf(HttpException);
        done();
      },
    });
  });
});
