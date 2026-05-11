import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { UsersService } from "./users.service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CTX = { user_id: "u1", tenant_id: "t1", role_id: "r1", user_type: "admin" as const, account_application_id: "app1" };

const USER_ROW = {
  id: "u1", tenant_id: "t1", account_id: "a1",
  email: "a@x.com", user_type: "admin", status: "active",
  created_at: new Date("2026-01-01"),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@cio-agent/auth/password", () => ({
  hashPassword: jest.fn<() => Promise<string>>().mockResolvedValue("$2b$12$hashed"),
}));

// Mock withRls — just call fn(mockTx) directly
const mockTx = {
  execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  select:  jest.fn(),
  insert:  jest.fn(),
  update:  jest.fn(),
  delete:  jest.fn(),
};

jest.mock("../common/db/with-rls.js", () => ({
  withRls: jest.fn(
    async (_db: unknown, _tid: string, fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
  ),
}));

const mockDb = {} as unknown as import("@cio-agent/db/client").Db;

// ── Chain builders ────────────────────────────────────────────────────────────

function selectOnce(rows: unknown[]) {
  const chain = {
    from:    jest.fn().mockReturnThis(),
    where:   jest.fn().mockReturnThis(),
    limit:   jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.select as jest.MockedFunction<typeof mockTx.select>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.select>);
  return chain;
}

function insertOnce(rows: unknown[]) {
  const chain = {
    values:    jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.insert as jest.MockedFunction<typeof mockTx.insert>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.insert>);
  return chain;
}

function updateOnce(rows: unknown[]) {
  const chain = {
    set:       jest.fn().mockReturnThis(),
    where:     jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.update as jest.MockedFunction<typeof mockTx.update>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.update>);
  return chain;
}

function deleteOnce(rows: unknown[]) {
  const chain = {
    where:     jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.delete as jest.MockedFunction<typeof mockTx.delete>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.delete>);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UsersService", () => {
  let service: UsersService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reassign to get fresh mock queues (avoids mockReturnValueOnce leaks between tests)
    mockTx.select  = jest.fn();
    mockTx.insert  = jest.fn();
    mockTx.update  = jest.fn();
    mockTx.delete  = jest.fn();
    mockTx.execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        (await import("./users.service.js")).UsersService,
        { provide: "DB", useValue: mockDb },
      ],
    }).compile();

    service = module.get((await import("./users.service.js")).UsersService);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns paginated users", async () => {
      selectOnce([USER_ROW]);

      const result = await service.list(CTX, { limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.has_more).toBe(false);
    });

    it("sets has_more when rows exceed limit", async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({ ...USER_ROW, id: `u${i}` }));
      selectOnce(rows);

      const result = await service.list(CTX, { limit: 2 });

      expect(result.pagination.has_more).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────────

  describe("findById", () => {
    it("returns user when found", async () => {
      selectOnce([USER_ROW]);
      const user = await service.findById(CTX, "u1");
      expect(user.email).toBe("a@x.com");
    });

    it("throws NotFoundException when not found", async () => {
      selectOnce([]);
      await expect(service.findById(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates user and returns response", async () => {
      selectOnce([]);                         // email uniqueness check
      selectOnce([{ account_id: "a1" }]);     // creator lookup
      insertOnce([USER_ROW]);                 // insert user

      const result = await service.create(CTX, {
        email: "new@x.com",
        password: "S3cur3P@ss!",
      });

      expect(result.email).toBe("a@x.com");
    });

    it("throws ConflictException on duplicate email", async () => {
      selectOnce([USER_ROW]);                 // email uniqueness check returns existing

      await expect(
        service.create(CTX, { email: "a@x.com", password: "S3cur3P@ss!" }),
      ).rejects.toThrow(ConflictException);
    });

    it("assigns roles when role_ids provided", async () => {
      selectOnce([]);
      selectOnce([{ account_id: "a1" }]);
      insertOnce([USER_ROW]);
      insertOnce([]);                         // userRoles insert

      await service.create(CTX, {
        email: "new@x.com",
        password: "S3cur3P@ss!",
        role_ids: ["r1"],
      });

      expect(mockTx.insert).toHaveBeenCalledTimes(2);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates user fields", async () => {
      selectOnce([]);                                          // email conflict check — no conflict
      updateOnce([{ ...USER_ROW, email: "new@x.com" }]);

      const result = await service.update(CTX, "u1", { email: "new@x.com" });
      expect(result.email).toBe("new@x.com");
    });

    it("throws NotFoundException when user not found", async () => {
      updateOnce([]);                                          // no email → skip conflict check
      await expect(service.update(CTX, "missing", { status: "inactive" })).rejects.toThrow(NotFoundException);
    });

    it("returns current user when dto is empty", async () => {
      selectOnce([USER_ROW]);
      const result = await service.update(CTX, "u1", {});
      expect(result.id).toBe("u1");
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("soft-deletes user by setting status inactive", async () => {
      updateOnce([{ id: "u1" }]);
      await expect(service.remove(CTX, "u1")).resolves.not.toThrow();
    });

    it("throws NotFoundException when user not found", async () => {
      updateOnce([]);
      await expect(service.remove(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── assignRoles ───────────────────────────────────────────────────────────────

  describe("assignRoles", () => {
    it("deletes existing roles and inserts new ones", async () => {
      deleteOnce([]);
      insertOnce([]);

      await service.assignRoles(CTX, "u1", ["r1", "r2"]);

      expect(mockTx.delete).toHaveBeenCalledTimes(1);
      expect(mockTx.insert).toHaveBeenCalledTimes(1);
    });

    it("deletes only when role_ids is empty", async () => {
      deleteOnce([]);

      await service.assignRoles(CTX, "u1", []);

      expect(mockTx.delete).toHaveBeenCalledTimes(1);
      expect(mockTx.insert).not.toHaveBeenCalled();
    });
  });
});
