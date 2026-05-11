import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { ConnectorsService } from "./connectors.service.js";

// ── Mocks (factories must NOT reference module-level variables — jest.mock is hoisted) ─

jest.mock("../common/db/with-rls.js", () => ({
  withRls: jest.fn(
    async (_db: unknown, _tid: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockTx),
  ),
}));

jest.mock("@cio-agent/vault/secrets", () => ({
  getConnectorSecret: jest.fn(),
}));

jest.mock("@cio-agent/connector-jira/connector", () => ({
  JiraConnector: jest.fn(),
}));

// ── Import mocked modules after jest.mock declarations ─────────────────────────

import { getConnectorSecret } from "@cio-agent/vault/secrets";
import { JiraConnector } from "@cio-agent/connector-jira/connector";
import type { ConnectorHealth } from "@cio-agent/connector-framework/types";

const mockGetConnectorSecret = getConnectorSecret as jest.MockedFunction<typeof getConnectorSecret>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockJiraConnector = JiraConnector as unknown as jest.MockedFunction<(...args: any[]) => any>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CTX = { user_id: "u1", tenant_id: "t1", role_id: "r1", user_type: "admin" as const, account_application_id: "app1" };

const CONN_ROW = {
  id:             "conn-1",
  tenant_id:      "t1",
  type:           "jira" as const,
  name:           "JIRA Prod",
  auth_config:    "tenant/t1/connector/jira",
  field_mapping:  {},
  webhook_config: {},
  is_active:      true,
  created_at:     new Date(),
};

const VAULT_SECRET = {
  auth_type:    "api_token",
  api_token:    "tok",
  username:     "user@test.com",
  instance_url: "https://test.atlassian.net",
};

// ── Shared TX mock (referenced by withRls mock factory via closure) ────────────

const mockTx = {
  execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  select:  jest.fn(),
  insert:  jest.fn(),
};

const mockDb    = {} as unknown as import("@cio-agent/db/client").Db;
const mockRedis = {
  sadd: jest.fn<() => Promise<number>>().mockResolvedValue(1),
} as unknown as import("ioredis").Redis;

// ── Chain builders ─────────────────────────────────────────────────────────────

function selectOnce(rows: unknown[]) {
  const chain = {
    from:  jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.select as jest.MockedFunction<typeof mockTx.select>).mockReturnValueOnce(
    chain as unknown as ReturnType<typeof mockTx.select>,
  );
}

function selectAllOnce(rows: unknown[]) {
  const chain = {
    from:  jest.fn().mockReturnThis(),
    where: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.select as jest.MockedFunction<typeof mockTx.select>).mockReturnValueOnce(
    chain as unknown as ReturnType<typeof mockTx.select>,
  );
}

function insertOnce(rows: unknown[]) {
  const chain = {
    values:    jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue(rows),
  };
  (mockTx.insert as jest.MockedFunction<typeof mockTx.insert>).mockReturnValueOnce(
    chain as unknown as ReturnType<typeof mockTx.insert>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ConnectorsService", () => {
  let service: ConnectorsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.select  = jest.fn();
    mockTx.insert  = jest.fn();
    mockTx.execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    (mockRedis.sadd as jest.MockedFunction<() => Promise<number>>).mockResolvedValue(1);

    mockGetConnectorSecret.mockResolvedValue(VAULT_SECRET);

    const healthyResult: ConnectorHealth = { healthy: true, latencyMs: 42, checkedAt: new Date() };
    MockJiraConnector.mockImplementation(() => ({
      config:      {},
      healthCheck: jest.fn<() => Promise<ConnectorHealth>>().mockResolvedValue(healthyResult),
      read:        jest.fn(),
      write:       jest.fn(),
    }));

    const module = await Test.createTestingModule({
      providers: [
        (await import("./connectors.service.js")).ConnectorsService,
        { provide: "DB",    useValue: mockDb },
        { provide: "REDIS", useValue: mockRedis },
      ],
    }).compile();

    service = module.get((await import("./connectors.service.js")).ConnectorsService);
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns all connectors for tenant", async () => {
      selectAllOnce([CONN_ROW]);
      const result = await service.list(CTX);
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("JIRA Prod");
    });

    it("returns empty array when no connectors registered", async () => {
      selectAllOnce([]);
      const result = await service.list(CTX);
      expect(result).toHaveLength(0);
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────────

  describe("findById", () => {
    it("returns connector when found", async () => {
      selectOnce([CONN_ROW]);
      const result = await service.findById(CTX, "conn-1");
      expect(result.id).toBe("conn-1");
      expect(result.type).toBe("jira");
    });

    it("throws NotFoundException when not found", async () => {
      selectOnce([]);
      await expect(service.findById(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates connector with vault path as auth_config", async () => {
      insertOnce([CONN_ROW]);
      const result = await service.create(CTX, { type: "jira", name: "JIRA Prod" });
      expect(result.name).toBe("JIRA Prod");
      expect(result.auth_config).toBe("tenant/t1/connector/jira");
    });

    it("sets field_mapping and webhook_config defaults when not provided", async () => {
      insertOnce([{ ...CONN_ROW, field_mapping: {}, webhook_config: {} }]);
      const result = await service.create(CTX, { type: "jira", name: "JIRA Prod" });
      expect(result.field_mapping).toEqual({});
      expect(result.webhook_config).toEqual({});
    });
  });

  // ── healthCheck ───────────────────────────────────────────────────────────────

  describe("healthCheck", () => {
    it("returns healthy result from JiraConnector", async () => {
      selectOnce([CONN_ROW]);
      const result = await service.healthCheck(CTX, "conn-1");
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBe(42);
    });

    it("returns unhealthy result when connector is down", async () => {
      selectOnce([CONN_ROW]);
      const unhealthyResult: ConnectorHealth = { healthy: false, error: "ECONNREFUSED", checkedAt: new Date() };
      MockJiraConnector.mockImplementationOnce(() => ({
        config:      {},
        healthCheck: jest.fn<() => Promise<ConnectorHealth>>().mockResolvedValue(unhealthyResult),
        read:        jest.fn(),
        write:       jest.fn(),
      }));
      const result = await service.healthCheck(CTX, "conn-1");
      expect(result.healthy).toBe(false);
      expect(result.error).toBe("ECONNREFUSED");
    });

    it("throws NotFoundException when connector does not exist", async () => {
      selectOnce([]);
      await expect(service.healthCheck(CTX, "missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── getConnectorInstance ──────────────────────────────────────────────────────

  describe("getConnectorInstance", () => {
    it("builds JiraConnector with vault credentials", async () => {
      selectOnce([CONN_ROW]);
      await service.getConnectorInstance(CTX, "conn-1");
      expect(JiraConnector).toHaveBeenCalledWith(
        expect.objectContaining({
          id:       "conn-1",
          tenantId: "t1",
          type:     "jira",
          authConfig: expect.objectContaining({
            host:     "https://test.atlassian.net",
            email:    "user@test.com",
            apiToken: "tok",
          }),
        }),
        mockRedis,
      );
    });

    it("fetches vault secret for the correct tenant and connector type", async () => {
      selectOnce([CONN_ROW]);
      await service.getConnectorInstance(CTX, "conn-1");
      expect(mockGetConnectorSecret).toHaveBeenCalledWith("t1", "jira");
    });
  });
});
