import { Test } from "@nestjs/testing";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { ConnectorPollingService } from "./connector-polling.service.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../common/db/with-rls.js", () => ({
  withRls: jest.fn(
    async (_db: unknown, _tid: string, fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
  ),
}));

jest.mock("@cio-agent/vault/secrets", () => ({
  getConnectorSecret: jest.fn(),
}));

jest.mock("@cio-agent/redis/streams", () => ({
  publishEvent: jest.fn(),
}));

jest.mock("@cio-agent/connector-jira/connector", () => ({
  JiraConnector: jest.fn(),
}));

import { getConnectorSecret } from "@cio-agent/vault/secrets";
import { publishEvent }       from "@cio-agent/redis/streams";
import { JiraConnector }      from "@cio-agent/connector-jira/connector";
import type { ConnectorReadResult } from "@cio-agent/connector-framework/types";

const mockGetConnectorSecret = getConnectorSecret as jest.MockedFunction<typeof getConnectorSecret>;
const mockPublishEvent       = publishEvent       as jest.MockedFunction<typeof publishEvent>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockJiraConnector      = JiraConnector as unknown as jest.MockedFunction<(...args: any[]) => any>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

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

const mockTx = {
  select:  jest.fn(),
  execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const mockSmembers = jest.fn<() => Promise<string[]>>();

const mockRedis = {
  smembers: mockSmembers,
  sadd:     jest.fn<() => Promise<number>>(),
} as unknown as import("ioredis").Redis;

const mockDb = {} as unknown as import("@cio-agent/db/client").Db;

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

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ConnectorPollingService", () => {
  let service: ConnectorPollingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockTx.select  = jest.fn();
    mockTx.execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    mockGetConnectorSecret.mockResolvedValue(VAULT_SECRET);
    mockPublishEvent.mockResolvedValue("stream-id");

    const readResult: ConnectorReadResult = {
      data:    [{ key: "PROJ-1", summary: "Test" }],
      hasMore: false,
      total:   1,
    };
    MockJiraConnector.mockImplementation(() => ({
      read: jest.fn<() => Promise<ConnectorReadResult>>().mockResolvedValue(readResult),
    }));

    const module = await Test.createTestingModule({
      providers: [
        (await import("./connector-polling.service.js")).ConnectorPollingService,
        { provide: "DB",    useValue: mockDb },
        { provide: "REDIS", useValue: mockRedis },
      ],
    }).compile();

    service = module.get((await import("./connector-polling.service.js")).ConnectorPollingService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  // ── poll ────────────────────────────────────────────────────────────────────

  describe("poll", () => {
    it("reads active connector members from Redis and polls each", async () => {
      mockSmembers.mockResolvedValue(["t1:conn-1"]);
      selectOnce([CONN_ROW]);

      await service.poll();

      expect(mockRedis.smembers).toHaveBeenCalledWith("active:connectors:jira");
      expect(MockJiraConnector).toHaveBeenCalledTimes(1);
      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "jira.poll", connectorId: "conn-1" }),
        mockRedis,
      );
    });

    it("skips malformed member entries", async () => {
      mockSmembers.mockResolvedValue(["invalid-no-colon"]);
      await service.poll();
      expect(MockJiraConnector).not.toHaveBeenCalled();
    });

    it("skips inactive connectors (not found in DB)", async () => {
      mockSmembers.mockResolvedValue(["t1:conn-deleted"]);
      selectOnce([]);  // DB returns empty — connector deactivated or deleted
      await service.poll();
      expect(MockJiraConnector).not.toHaveBeenCalled();
    });

    it("continues polling other connectors when one fails", async () => {
      mockSmembers.mockResolvedValue(["t1:conn-1", "t2:conn-2"]);
      selectOnce([CONN_ROW]);
      selectOnce([{ ...CONN_ROW, id: "conn-2", tenant_id: "t2" }]);

      const emptyResult: ConnectorReadResult = { data: [], hasMore: false, total: 0 };
      MockJiraConnector
        .mockImplementationOnce(() => ({
          read: jest.fn<() => Promise<ConnectorReadResult>>().mockRejectedValue(new Error("JIRA down")),
        }))
        .mockImplementationOnce(() => ({
          read: jest.fn<() => Promise<ConnectorReadResult>>().mockResolvedValue(emptyResult),
        }));

      await service.poll();

      expect(MockJiraConnector).toHaveBeenCalledTimes(2);
      expect(mockPublishEvent).toHaveBeenCalledTimes(1);
    });
  });

  // ── pollConnector ────────────────────────────────────────────────────────────

  describe("pollConnector", () => {
    it("fetches Vault secret and builds JiraConnector with correct config", async () => {
      await service.pollConnector(CONN_ROW);
      expect(mockGetConnectorSecret).toHaveBeenCalledWith("t1", "jira");
      expect(MockJiraConnector).toHaveBeenCalledWith(
        expect.objectContaining({
          id:       "conn-1",
          tenantId: "t1",
          authConfig: expect.objectContaining({ host: "https://test.atlassian.net" }),
        }),
        mockRedis,
      );
    });

    it("publishes poll event to Redis Stream", async () => {
      await service.pollConnector(CONN_ROW);
      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId:    "t1",
          eventType:   "jira.poll",
          connectorId: "conn-1",
          payload:     expect.objectContaining({ issues: expect.any(Array) }),
        }),
        mockRedis,
      );
    });
  });

  // ── lifecycle ────────────────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("onModuleInit sets a timer", () => {
      service.onModuleInit();
      expect(service["timer"]).not.toBeNull();
      service.onModuleDestroy();
    });

    it("onModuleDestroy clears the timer", () => {
      service.onModuleInit();
      service.onModuleDestroy();
      expect(service["timer"]).toBeNull();
    });
  });
});
