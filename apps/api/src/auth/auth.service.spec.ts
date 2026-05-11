import { Test } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { AuthService } from "./auth.service.js";

// ── Shared test data ──────────────────────────────────────────────────────────

const TENANT_ID       = "tenant-uuid-001";
const USER_ID         = "user-uuid-001";
const ROLE_ID         = "role-uuid-001";
const ACCOUNT_APP_ID  = "acct-app-uuid-001";

const ACTIVE_USER = {
  id:            USER_ID,
  tenant_id:     TENANT_ID,
  email:         "admin@acme.com",
  password_hash: "$2b$12$hashed",
  user_type:     "admin",
  status:        "active",
  account_id:    "account-uuid-001",
  created_at:    new Date(),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@cio-agent/auth/password", () => ({
  verifyPassword: jest.fn<() => Promise<boolean>>(),
}));

jest.mock("@cio-agent/auth/jwt", () => ({
  signTokenPair: jest.fn<() => Promise<object>>(),
  verifyRefreshToken: jest.fn<() => Promise<object>>(),
  decodeTokenUnsafe: jest.fn<() => Promise<object | null>>(),
}));

import { verifyPassword } from "@cio-agent/auth/password";
import { signTokenPair, verifyRefreshToken, decodeTokenUnsafe } from "@cio-agent/auth/jwt";

const mockVerifyPassword    = verifyPassword    as jest.MockedFunction<typeof verifyPassword>;
const mockSignTokenPair     = signTokenPair     as jest.MockedFunction<typeof signTokenPair>;
const mockVerifyRefresh     = verifyRefreshToken as jest.MockedFunction<typeof verifyRefreshToken>;
const mockDecodeTokenUnsafe = decodeTokenUnsafe  as jest.MockedFunction<typeof decodeTokenUnsafe>;

const MOCK_TOKEN_PAIR = {
  access_token:  "access.token.value",
  refresh_token: "refresh.token.value",
  expires_in:    900,
};

// DB mock — returns active user by default
const mockDbSelect = jest.fn();
const mockDb = {
  select: mockDbSelect,
} as unknown as import("@cio-agent/db/client").Db;

// Redis mock
const mockRedisSetex = jest.fn<() => Promise<string>>();
const mockRedisDel   = jest.fn<() => Promise<number>>();
const mockRedisGet   = jest.fn<() => Promise<string | null>>();
const mockRedisExists = jest.fn<() => Promise<number>>();
const mockRedis = {
  setex:  mockRedisSetex,
  del:    mockRedisDel,
  get:    mockRedisGet,
  exists: mockRedisExists,
} as unknown as import("@cio-agent/redis/client").RedisClient;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSelectChain(rows: unknown[]) {
  const chain = {
    from:  jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  mockDbSelect.mockReturnValueOnce(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockSignTokenPair.mockResolvedValue(MOCK_TOKEN_PAIR);
    mockDecodeTokenUnsafe.mockResolvedValue({
      sub: USER_ID, tenant_id: TENANT_ID, role_id: ROLE_ID, user_type: "admin" as const,
      account_application_id: ACCOUNT_APP_ID,
      jti: "jti-123", exp: Math.floor(Date.now() / 1000) + 900,
    });
    mockRedisSetex.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
    mockRedisGet.mockResolvedValue(JSON.stringify({ user_id: USER_ID, tenant_id: TENANT_ID }));

    const module = await Test.createTestingModule({
      providers: [
        (await import("./auth.service.js")).AuthService,
        { provide: "DB",    useValue: mockDb },
        { provide: "REDIS", useValue: mockRedis },
      ],
    }).compile();

    service = module.get((await import("./auth.service.js")).AuthService);
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe("login", () => {
    it("returns token pair on valid credentials", async () => {
      buildSelectChain([ACTIVE_USER]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);
      mockVerifyPassword.mockResolvedValue(true);

      const result = await service.login({
        email: "admin@acme.com",
        password: "S3cur3P@ss!",
        tenant_id: TENANT_ID,
      });

      expect(result).toEqual(MOCK_TOKEN_PAIR);
      expect(mockSignTokenPair).toHaveBeenCalledWith({
        sub: USER_ID, tenant_id: TENANT_ID, role_id: ROLE_ID, user_type: "admin",
        account_application_id: ACCOUNT_APP_ID,
      });
    });

    it("throws UnauthorizedException when user not found", async () => {
      buildSelectChain([]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: "nobody@acme.com", password: "pass1234", tenant_id: TENANT_ID }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when user is inactive", async () => {
      buildSelectChain([{ ...ACTIVE_USER, status: "inactive" }]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: "admin@acme.com", password: "S3cur3P@ss!", tenant_id: TENANT_ID }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException on wrong password", async () => {
      buildSelectChain([ACTIVE_USER]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);
      mockVerifyPassword.mockResolvedValue(false);

      await expect(
        service.login({ email: "admin@acme.com", password: "wrongpass", tenant_id: TENANT_ID }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("stores refresh token in Redis", async () => {
      buildSelectChain([ACTIVE_USER]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);
      mockVerifyPassword.mockResolvedValue(true);

      await service.login({ email: "admin@acme.com", password: "S3cur3P@ss!", tenant_id: TENANT_ID });

      expect(mockRedisSetex).toHaveBeenCalledWith(
        "token:refresh:jti-123",
        expect.any(Number),
        expect.stringContaining(USER_ID),
      );
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe("refresh", () => {
    it("returns new token pair on valid refresh token", async () => {
      mockVerifyRefresh.mockResolvedValue({ sub: USER_ID, tenant_id: TENANT_ID, jti: "refresh-jti" });
      buildSelectChain([ACTIVE_USER]);
      buildSelectChain([{ role_id: ROLE_ID }]);
      buildSelectChain([{ id: ACCOUNT_APP_ID }]);

      const result = await service.refresh({ refresh_token: "refresh.token.value" });

      expect(result).toEqual(MOCK_TOKEN_PAIR);
      expect(mockRedisDel).toHaveBeenCalledWith("token:refresh:refresh-jti");
    });

    it("throws UnauthorizedException when refresh token not in Redis", async () => {
      mockVerifyRefresh.mockResolvedValue({ sub: USER_ID, tenant_id: TENANT_ID, jti: "refresh-jti" });
      mockRedisGet.mockResolvedValue(null);

      await expect(
        service.refresh({ refresh_token: "refresh.token.value" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when refresh token is invalid JWT", async () => {
      mockVerifyRefresh.mockRejectedValue(new Error("invalid"));

      await expect(
        service.refresh({ refresh_token: "bad.token" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe("logout", () => {
    it("blacklists access token jti in Redis", async () => {
      await service.logout("access.token.value");

      expect(mockRedisSetex).toHaveBeenCalledWith(
        "token:blacklist:jti-123",
        expect.any(Number),
        "1",
      );
    });

    it("deletes refresh token from Redis when provided", async () => {
      mockVerifyRefresh.mockResolvedValue({ sub: USER_ID, tenant_id: TENANT_ID, jti: "refresh-jti" });

      await service.logout("access.token.value", "refresh.token.value");

      expect(mockRedisDel).toHaveBeenCalledWith("token:refresh:refresh-jti");
    });

    it("does not throw if refresh token is already invalid", async () => {
      mockVerifyRefresh.mockRejectedValue(new Error("expired"));

      await expect(
        service.logout("access.token.value", "bad.refresh.token"),
      ).resolves.not.toThrow();
    });
  });
});
