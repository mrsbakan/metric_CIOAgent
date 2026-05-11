import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { RolesService } from "./roles.service.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CTX = { user_id: "u1", tenant_id: "t1", role_id: "r1", user_type: "admin" as const, account_application_id: "app1" };

const ROLE_ROW = {
  id: "r1", tenant_id: "t1", name: "Admin",
  description: null, permissions: {}, escalation_config: {}, alert_thresholds: {},
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

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
}

function selectAllOnce(rows: unknown[]) {
  const chain = {
    from:  jest.fn().mockReturnThis(),
    where: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.select as jest.MockedFunction<typeof mockTx.select>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.select>);
}

function insertOnce(rows: unknown[]) {
  const chain = {
    values:    jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.insert as jest.MockedFunction<typeof mockTx.insert>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.insert>);
}

function updateOnce(rows: unknown[]) {
  const chain = {
    set:       jest.fn().mockReturnThis(),
    where:     jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.update as jest.MockedFunction<typeof mockTx.update>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.update>);
}

function deleteOnce(rows: unknown[]) {
  const chain = {
    where:     jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.delete as jest.MockedFunction<typeof mockTx.delete>).mockReturnValueOnce(chain as unknown as ReturnType<typeof mockTx.delete>);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RolesService", () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.select  = jest.fn();
    mockTx.insert  = jest.fn();
    mockTx.update  = jest.fn();
    mockTx.delete  = jest.fn();
    mockTx.execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        (await import("./roles.service.js")).RolesService,
        { provide: "DB", useValue: mockDb },
      ],
    }).compile();

    service = module.get((await import("./roles.service.js")).RolesService);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns all roles for tenant", async () => {
      selectAllOnce([ROLE_ROW]);
      const result = await service.list(CTX);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("Admin");
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────────

  describe("findById", () => {
    it("returns role when found", async () => {
      selectOnce([ROLE_ROW]);
      const role = await service.findById(CTX, "r1");
      expect(role.id).toBe("r1");
    });

    it("throws NotFoundException when not found", async () => {
      selectOnce([]);
      await expect(service.findById(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates role successfully", async () => {
      selectOnce([]);                  // name uniqueness check
      insertOnce([ROLE_ROW]);

      const result = await service.create(CTX, { name: "Admin" });
      expect(result.name).toBe("Admin");
    });

    it("throws ConflictException on duplicate name", async () => {
      selectOnce([ROLE_ROW]);

      await expect(service.create(CTX, { name: "Admin" })).rejects.toThrow(ConflictException);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────────

  describe("update", () => {
    it("updates role fields", async () => {
      selectOnce([]);                                          // name conflict check — no conflict
      updateOnce([{ ...ROLE_ROW, name: "SuperAdmin" }]);

      const result = await service.update(CTX, "r1", { name: "SuperAdmin" });
      expect(result.name).toBe("SuperAdmin");
    });

    it("throws NotFoundException when role not found", async () => {
      selectOnce([]);                                          // name conflict check — no conflict
      updateOnce([]);                                          // update returns empty
      await expect(service.update(CTX, "missing", { name: "X" })).rejects.toThrow(NotFoundException);
    });

    it("returns current role when dto is empty", async () => {
      selectOnce([ROLE_ROW]);
      const result = await service.update(CTX, "r1", {});
      expect(result.id).toBe("r1");
    });
  });

  // ── remove ───────────────────────────────────────────────────────────────────

  describe("remove", () => {
    it("deletes role after clearing user_roles", async () => {
      deleteOnce([]);                  // user_roles cascade
      deleteOnce([{ id: "r1" }]);      // role delete

      await expect(service.remove(CTX, "r1")).resolves.not.toThrow();
      expect(mockTx.delete).toHaveBeenCalledTimes(2);
    });

    it("throws NotFoundException when role not found", async () => {
      deleteOnce([]);                  // user_roles cascade
      deleteOnce([]);                  // role delete returns empty

      await expect(service.remove(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });
});
