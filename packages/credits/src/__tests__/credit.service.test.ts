import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Redis } from "ioredis";
import type { CreditResult } from "@cio-agent/redis/credits";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDeductCredits = jest.fn<() => Promise<CreditResult>>();
const mockGetRedisBalance = jest.fn<() => Promise<number | null>>();
const mockLoadCredits = jest.fn<() => Promise<number>>();
const mockGetCreditBalance = jest.fn<() => Promise<number>>();

jest.mock("@cio-agent/redis/credits", () => ({
  deductCredits:  mockDeductCredits,
  getBalance:     mockGetRedisBalance,
  loadCredits:    mockLoadCredits,
}));

jest.mock("@cio-agent/db", () => ({
  creditLedger:      {},
  getCreditBalance:  mockGetCreditBalance,
}));

function makeInsertChain() {
  const values = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const insert = jest.fn().mockReturnValue({ values });
  return { insert, values };
}

function makeSelectChain(balanceResult: number) {
  const where = jest.fn<() => Promise<Array<{ balance: number }>>>()
    .mockResolvedValue([{ balance: balanceResult }]);
  const from  = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select, from, where };
}

function makeRedis(setResult = "OK") {
  return {
    set: jest.fn<() => Promise<string>>().mockResolvedValue(setResult),
  } as unknown as Redis;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CreditService", () => {
  let CreditService: typeof import("../credit.service.js").CreditService;

  const TENANT   = "tenant-abc";
  const ACCT_APP = "00000000-0000-0000-0000-000000000001";
  const ACTION   = "jira.issue.create";

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    ({ CreditService } = await import("../credit.service.js"));
  });

  // ─── deduct ────────────────────────────────────────────────────────────────

  describe("deduct", () => {
    it("returns remaining balance and inserts debit ledger entry on success", async () => {
      mockDeductCredits.mockResolvedValue({ ok: true, remaining: 95 });
      const { insert, values } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      const svc = new CreditService(db, makeRedis());
      const result = await svc.deduct({ tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 5, actionType: ACTION });

      expect(result.remaining).toBe(95);
      expect(insert).toHaveBeenCalledTimes(1);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ type: "debit", amount: 5, action_type: ACTION }),
      );
    });

    it("throws InsufficientCreditsError when Redis returns INSUFFICIENT_CREDITS", async () => {
      mockDeductCredits.mockResolvedValue({ ok: false, reason: "INSUFFICIENT_CREDITS" });
      mockGetRedisBalance.mockResolvedValue(3);
      const { insert } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      await expect(
        new CreditService(db, makeRedis()).deduct({ tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 10, actionType: ACTION }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    });

    it("throws InsufficientCreditsError when Redis returns NO_BALANCE", async () => {
      mockDeductCredits.mockResolvedValue({ ok: false, reason: "NO_BALANCE" });
      mockGetRedisBalance.mockResolvedValue(null);
      const { insert } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      await expect(
        new CreditService(db, makeRedis()).deduct({ tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 5, actionType: ACTION }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    });

    it("does not insert ledger entry when deduction fails", async () => {
      mockDeductCredits.mockResolvedValue({ ok: false, reason: "INSUFFICIENT_CREDITS" });
      mockGetRedisBalance.mockResolvedValue(0);
      const { insert } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      await expect(
        new CreditService(db, makeRedis()).deduct({ tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 5, actionType: ACTION }),
      ).rejects.toThrow();

      expect(insert).not.toHaveBeenCalled();
    });

    it("passes referenceId to ledger when provided", async () => {
      mockDeductCredits.mockResolvedValue({ ok: true, remaining: 90 });
      const { insert, values } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      await new CreditService(db, makeRedis()).deduct({
        tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 10, actionType: ACTION, referenceId: "session-uuid",
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ reference_id: "session-uuid" }),
      );
    });
  });

  // ─── refund ────────────────────────────────────────────────────────────────

  describe("refund", () => {
    it("inserts credit ledger entry and adds back to Redis", async () => {
      mockLoadCredits.mockResolvedValue(105);
      const { insert, values } = makeInsertChain();
      const db = { insert } as unknown as import("@cio-agent/db").Db;

      await new CreditService(db, makeRedis()).refund({
        tenantId: TENANT, accountApplicationId: ACCT_APP, amount: 5, actionType: ACTION,
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ type: "credit", amount: 5 }),
      );
      expect(mockLoadCredits).toHaveBeenCalledWith(TENANT, 5, expect.anything());
    });
  });

  // ─── getBalance ────────────────────────────────────────────────────────────

  describe("getBalance", () => {
    it("returns Redis cached value without hitting DB", async () => {
      mockGetRedisBalance.mockResolvedValue(200);
      const db = {} as unknown as import("@cio-agent/db").Db;

      const balance = await new CreditService(db, makeRedis()).getBalance(TENANT, ACCT_APP);

      expect(balance).toBe(200);
      expect(mockGetCreditBalance).not.toHaveBeenCalled();
    });

    it("falls back to DB and populates Redis cache on cache miss", async () => {
      mockGetRedisBalance.mockResolvedValue(null);
      mockGetCreditBalance.mockResolvedValue(150);
      const db = {} as unknown as import("@cio-agent/db").Db;
      const redis = makeRedis();

      const balance = await new CreditService(db, redis).getBalance(TENANT, ACCT_APP);

      expect(balance).toBe(150);
      expect(redis.set).toHaveBeenCalledWith(`credit:${TENANT}:global`, 150);
    });

    it("returns 0 when ledger is empty", async () => {
      mockGetRedisBalance.mockResolvedValue(null);
      mockGetCreditBalance.mockResolvedValue(0);
      const db = {} as unknown as import("@cio-agent/db").Db;

      const balance = await new CreditService(db, makeRedis()).getBalance(TENANT, ACCT_APP);
      expect(balance).toBe(0);
    });
  });
});
