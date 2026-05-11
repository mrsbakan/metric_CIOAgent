import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { MemoryService } from "../memory/memory-service.js";
import { encryptMemory } from "../memory/crypto.js";
import type { MemoryUserRow, MemoryRoleRow } from "@cio-agent/db";

// ── Mock @cio-agent/db ────────────────────────────────────────────────────────

const mockWithRls   = jest.fn<typeof import("@cio-agent/db")["withRls"]>();
const mockGetUser   = jest.fn<typeof import("@cio-agent/db")["getAllUserMemory"]>();
const mockUpsertUser = jest.fn<typeof import("@cio-agent/db")["upsertUserMemory"]>();
const mockGetRole   = jest.fn<typeof import("@cio-agent/db")["getAllRoleMemory"]>();
const mockUpsertRole = jest.fn<typeof import("@cio-agent/db")["upsertRoleMemory"]>();

jest.mock("@cio-agent/db", () => ({
  withRls:          (db: unknown, tenantId: unknown, fn: unknown) =>
    mockWithRls(db as never, tenantId as never, fn as never),
  getAllUserMemory:  (db: unknown, userId: unknown) =>
    mockGetUser(db as never, userId as never),
  upsertUserMemory: (db: unknown, params: unknown) =>
    mockUpsertUser(db as never, params as never),
  getAllRoleMemory:  (db: unknown, roleId: unknown) =>
    mockGetRole(db as never, roleId as never),
  upsertRoleMemory: (db: unknown, params: unknown) =>
    mockUpsertRole(db as never, params as never),
}));

const TENANT_ID = "tenant-1";
const USER_ID   = "user-1";
const ROLE_ID   = "role-1";
const DB        = {} as import("@cio-agent/db").Db;
const KEY       = randomBytes(32);

function makeUserRow(key: string, plaintext: string): MemoryUserRow {
  return {
    id: "row-1", tenant_id: TENANT_ID, user_id: USER_ID,
    key, value: encryptMemory(plaintext, KEY),
    created_at: new Date(), updated_at: new Date(),
  };
}

function makeRoleRow(key: string, plaintext: string): MemoryRoleRow {
  return {
    id: "row-1", tenant_id: TENANT_ID, role_id: ROLE_ID,
    key, value: encryptMemory(plaintext, KEY),
    created_at: new Date(), updated_at: new Date(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // withRls executes the callback directly (passes db through)
  mockWithRls.mockImplementation((_db, _tenantId, fn) => fn(DB as never));
});

// ─── loadAllUserMemory ────────────────────────────────────────────────────────

describe("MemoryService.loadAllUserMemory", () => {
  it("returns an empty object when no entries exist", async () => {
    mockGetUser.mockResolvedValue([]);
    const svc = new MemoryService(DB, KEY);

    const result = await svc.loadAllUserMemory(TENANT_ID, USER_ID);

    expect(result).toEqual({});
  });

  it("decrypts all entries and returns a key-value map", async () => {
    mockGetUser.mockResolvedValue([
      makeUserRow("sprint_context", "velocity=42"),
      makeUserRow("tone",           "formal"),
    ]);
    const svc = new MemoryService(DB, KEY);

    const result = await svc.loadAllUserMemory(TENANT_ID, USER_ID);

    expect(result).toEqual({ sprint_context: "velocity=42", tone: "formal" });
  });

  it("calls withRls with the correct tenantId", async () => {
    mockGetUser.mockResolvedValue([]);
    const svc = new MemoryService(DB, KEY);
    await svc.loadAllUserMemory(TENANT_ID, USER_ID);

    expect(mockWithRls).toHaveBeenCalledWith(DB, TENANT_ID, expect.any(Function));
  });
});

// ─── loadAllRoleMemory ────────────────────────────────────────────────────────

describe("MemoryService.loadAllRoleMemory", () => {
  it("decrypts all role memory entries", async () => {
    mockGetRole.mockResolvedValue([makeRoleRow("policy", "strict")]);
    const svc = new MemoryService(DB, KEY);

    const result = await svc.loadAllRoleMemory(TENANT_ID, ROLE_ID);

    expect(result).toEqual({ policy: "strict" });
  });

  it("returns empty object when no role entries", async () => {
    mockGetRole.mockResolvedValue([]);
    const svc = new MemoryService(DB, KEY);
    expect(await svc.loadAllRoleMemory(TENANT_ID, ROLE_ID)).toEqual({});
  });
});

// ─── writeUserMemory ──────────────────────────────────────────────────────────

describe("MemoryService.writeUserMemory", () => {
  it("encrypts the value before storing", async () => {
    mockUpsertUser.mockResolvedValue(makeUserRow("k", "v"));
    const svc = new MemoryService(DB, KEY);
    await svc.writeUserMemory(TENANT_ID, USER_ID, "k", "plaintext-value");

    const callArg = (mockUpsertUser.mock.calls[0]![1] as { value: string });
    // The stored value must NOT equal the plaintext
    expect(callArg.value).not.toBe("plaintext-value");
    // But it must decrypt back correctly
    const { decryptMemory } = await import("../memory/crypto.js");
    expect(decryptMemory(callArg.value, KEY)).toBe("plaintext-value");
  });

  it("calls upsertUserMemory with correct params", async () => {
    mockUpsertUser.mockResolvedValue(makeUserRow("sprint", "v42"));
    const svc = new MemoryService(DB, KEY);
    await svc.writeUserMemory(TENANT_ID, USER_ID, "sprint", "v42");

    expect(mockUpsertUser).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({ tenant_id: TENANT_ID, user_id: USER_ID, key: "sprint" }),
    );
  });
});

// ─── writeRoleMemory ──────────────────────────────────────────────────────────

describe("MemoryService.writeRoleMemory", () => {
  it("encrypts and stores role memory", async () => {
    mockUpsertRole.mockResolvedValue(makeRoleRow("policy", "strict"));
    const svc = new MemoryService(DB, KEY);
    await svc.writeRoleMemory(TENANT_ID, ROLE_ID, "policy", "strict");

    expect(mockUpsertRole).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({ tenant_id: TENANT_ID, role_id: ROLE_ID, key: "policy" }),
    );
  });
});
