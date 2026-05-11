import { Test } from "@nestjs/testing";
import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { ConnectorDlqService } from "./connector-dlq.service.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../common/db/with-rls.js", () => ({
  withRls: jest.fn(
    async (_db: unknown, _tid: string, fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
  ),
}));

jest.mock("@cio-agent/redis/streams", () => ({
  publishEvent: jest.fn(),
}));

import { publishEvent } from "@cio-agent/redis/streams";

const mockPublishEvent = publishEvent as jest.MockedFunction<typeof publishEvent>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW   = new Date("2024-01-01T12:00:00Z");
const STUCK = new Date("2024-01-01T11:50:00Z"); // 10 min ago

const makeEvent = (overrides: Partial<{
  id: string;
  connector_id: string;
  event_type: string;
  status: "pending" | "processed" | "dlq";
  retry_count: number;
  received_at: Date;
  payload: Record<string, unknown>;
  tenant_id: string;
  processed_at: Date | null;
}> = {}) => ({
  id:           "evt-1",
  connector_id: "conn-1",
  event_type:   "jira.issue_updated",
  status:       "pending" as const,
  retry_count:  0,
  received_at:  STUCK,
  processed_at: null,
  payload:      { issue: "PROJ-1" },
  tenant_id:    "t1",
  ...overrides,
});

// ── Mock DB transaction ───────────────────────────────────────────────────────

const mockUpdateChain = {
  set:   jest.fn().mockReturnThis(),
  where: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

const mockTx = {
  select: jest.fn(),
  update: jest.fn().mockReturnValue(mockUpdateChain),
};

// ── Mock Redis ────────────────────────────────────────────────────────────────

const mockSmembers = jest.fn<() => Promise<string[]>>();
const mockExists   = jest.fn<() => Promise<number>>();
const mockSetex    = jest.fn<() => Promise<string>>();

const mockRedis = {
  smembers: mockSmembers,
  exists:   mockExists,
  setex:    mockSetex,
} as unknown as import("ioredis").Redis;

const mockDb = {} as unknown as import("@cio-agent/db/client").Db;

// ── Select chain builder ──────────────────────────────────────────────────────

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ConnectorDlqService", () => {
  let service: ConnectorDlqService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);

    mockTx.select = jest.fn();
    mockTx.update = jest.fn().mockReturnValue(mockUpdateChain);
    mockUpdateChain.set   = jest.fn().mockReturnThis();
    mockUpdateChain.where = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

    mockPublishEvent.mockResolvedValue("stream-id");
    mockSetex.mockResolvedValue("OK");

    const module = await Test.createTestingModule({
      providers: [
        (await import("./connector-dlq.service.js")).ConnectorDlqService,
        { provide: "DB",    useValue: mockDb },
        { provide: "REDIS", useValue: mockRedis },
      ],
    }).compile();

    service = module.get((await import("./connector-dlq.service.js")).ConnectorDlqService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  // ── lifecycle ────────────────────────────────────────────────────────────────

  describe("lifecycle", () => {
    it("onModuleInit sets a timer", () => {
      service.onModuleInit();
      expect(service["timer"]).not.toBeNull();
    });

    it("onModuleDestroy clears the timer", () => {
      service.onModuleInit();
      service.onModuleDestroy();
      expect(service["timer"]).toBeNull();
    });
  });

  // ── process ──────────────────────────────────────────────────────────────────

  describe("process", () => {
    it("reads active connectors and delegates to processMember", async () => {
      mockSmembers.mockResolvedValue(["t1:conn-1"]);
      mockExists.mockResolvedValue(0);
      selectOnce([makeEvent()]);

      await service.process();

      expect(mockRedis.smembers).toHaveBeenCalledWith("active:connectors:jira");
    });

    it("skips malformed member entries (no colon)", async () => {
      mockSmembers.mockResolvedValue(["invalid"]);
      await service.process();
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it("continues when one member throws", async () => {
      mockSmembers.mockResolvedValue(["t1:conn-1", "t2:conn-2"]);
      mockExists.mockResolvedValue(0);
      selectOnce([makeEvent()]);                                // conn-1 → 1 stuck event
      selectOnce([makeEvent({ tenant_id: "t2", connector_id: "conn-2" })]);
      (mockTx.update as jest.MockedFunction<typeof mockTx.update>)
        .mockReturnValueOnce({ ...mockUpdateChain, where: jest.fn<() => Promise<never>>().mockRejectedValue(new Error("DB error")) } as unknown as typeof mockUpdateChain)
        .mockReturnValue(mockUpdateChain);

      await service.process(); // should not throw

      expect(mockRedis.smembers).toHaveBeenCalledTimes(1);
    });
  });

  // ── retryOrDlq ───────────────────────────────────────────────────────────────

  describe("retryOrDlq", () => {
    it("skips event if retry guard is active", async () => {
      mockExists.mockResolvedValue(1);
      await service.retryOrDlq("t1", makeEvent());
      expect(mockPublishEvent).not.toHaveBeenCalled();
    });

    it("increments retry_count and re-publishes on first retry", async () => {
      mockExists.mockResolvedValue(0);
      const event = makeEvent({ retry_count: 0 });

      await service.retryOrDlq("t1", event);

      expect(mockTx.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({ retry_count: 1 }));
      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId:  "t1",
          eventType: "jira.issue_updated",
          payload:   expect.objectContaining({ _retry: 1, _eventId: "evt-1" }),
        }),
        mockRedis,
      );
    });

    it("sets retry guard after re-publishing", async () => {
      mockExists.mockResolvedValue(0);
      await service.retryOrDlq("t1", makeEvent({ retry_count: 1 }));

      expect(mockRedis.setex).toHaveBeenCalledWith(
        "connector:retry:guard:evt-1",
        300, // CONNECTOR_RETRY_GUARD TTL
        "1",
      );
    });

    it("moves to DLQ and publishes alert when retry_count reaches MAX_RETRIES", async () => {
      mockExists.mockResolvedValue(0);
      const event = makeEvent({ retry_count: 2 }); // newRetryCount = 3 = MAX_RETRIES

      await service.retryOrDlq("t1", event);

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "dlq", retry_count: 3 }),
      );
      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId:  "t1",
          eventType: "connector.dlq.alert",
          payload:   expect.objectContaining({ eventId: "evt-1", retryCount: 3 }),
        }),
        mockRedis,
      );
    });

    it("does NOT set retry guard when moving to DLQ", async () => {
      mockExists.mockResolvedValue(0);
      await service.retryOrDlq("t1", makeEvent({ retry_count: 2 }));

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it("alert payload includes connectorId", async () => {
      mockExists.mockResolvedValue(0);
      await service.retryOrDlq("t1", makeEvent({ retry_count: 2, connector_id: "conn-42" }));

      expect(mockPublishEvent).toHaveBeenCalledWith(
        expect.objectContaining({ connectorId: "conn-42" }),
        mockRedis,
      );
    });
  });
});
