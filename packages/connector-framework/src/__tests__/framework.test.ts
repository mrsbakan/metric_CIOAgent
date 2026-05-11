import { describe, it, expect } from "@jest/globals";
import { BaseConnector } from "../base.js";
import {
  ConnectorAuthError,
  ConnectorError,
  ConnectorIdempotencyConflictError,
  ConnectorNotFoundError,
  ConnectorRateLimitError,
  ConnectorUnavailableError,
} from "../errors.js";
import type { ConnectorConfig, ConnectorHealth, ConnectorReadParams, ConnectorReadResult, ConnectorWriteParams, ConnectorWriteResult } from "../types.js";
import { AppError } from "@cio-agent/shared/errors";

const mockConfig: ConnectorConfig = {
  id: "conn-1",
  tenantId: "tenant-1",
  type: "jira",
  name: "Test Connector",
  authConfig: { apiToken: "tok" },
  fieldMapping: {},
  webhookConfig: {},
};

class TestConnector extends BaseConnector {
  async read(_params: ConnectorReadParams): Promise<ConnectorReadResult> {
    return { data: [], hasMore: false };
  }
  async write(_params: ConnectorWriteParams): Promise<ConnectorWriteResult> {
    return {
      resourceId: "r1",
      resourceType: "issue",
      action: "create",
      idempotencyKey: "idem-1",
    };
  }
  async healthCheck(): Promise<ConnectorHealth> {
    return { healthy: true, checkedAt: new Date() };
  }
}

describe("BaseConnector", () => {
  it("stores config on construction", () => {
    const connector = new TestConnector(mockConfig);
    expect(connector.config).toBe(mockConfig);
    expect(connector.config.type).toBe("jira");
  });

  it("read returns expected shape", async () => {
    const connector = new TestConnector(mockConfig);
    const result = await connector.read({ resourceType: "issue" });
    expect(result.data).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("write returns expected shape", async () => {
    const connector = new TestConnector(mockConfig);
    const result = await connector.write({
      resourceType: "issue",
      action: "create",
      payload: {},
      idempotencyKey: "idem-1",
    });
    expect(result.resourceId).toBe("r1");
    expect(result.action).toBe("create");
  });

  it("healthCheck returns healthy", async () => {
    const connector = new TestConnector(mockConfig);
    const health = await connector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.checkedAt).toBeInstanceOf(Date);
  });
});

describe("ConnectorError hierarchy", () => {
  it("ConnectorError extends AppError", () => {
    const err = new ConnectorError("TEST_CODE", "test message", "jira");
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("TEST_CODE");
    expect(err.connectorType).toBe("jira");
  });

  it("ConnectorAuthError has correct code and name", () => {
    const err = new ConnectorAuthError("jira");
    expect(err).toBeInstanceOf(ConnectorError);
    expect(err.code).toBe("CONNECTOR_AUTH_FAILED");
    expect(err.name).toBe("ConnectorAuthError");
  });

  it("ConnectorRateLimitError carries retryAfterMs in detail", () => {
    const err = new ConnectorRateLimitError("jira", 5000);
    expect(err.code).toBe("CONNECTOR_RATE_LIMITED");
    expect(err.detail).toContain("5000");
  });

  it("ConnectorRateLimitError works without retryAfterMs", () => {
    const err = new ConnectorRateLimitError("jira");
    expect(err.detail).toBeUndefined();
  });

  it("ConnectorNotFoundError includes resourceId in detail", () => {
    const err = new ConnectorNotFoundError("jira", "PROJ-123");
    expect(err.code).toBe("CONNECTOR_RESOURCE_NOT_FOUND");
    expect(err.detail).toContain("PROJ-123");
  });

  it("ConnectorIdempotencyConflictError includes idempotencyKey in detail", () => {
    const err = new ConnectorIdempotencyConflictError("jira", "idem-xyz");
    expect(err.code).toBe("CONNECTOR_IDEMPOTENCY_CONFLICT");
    expect(err.detail).toContain("idem-xyz");
    expect(err.name).toBe("ConnectorIdempotencyConflictError");
  });

  it("ConnectorUnavailableError has correct code", () => {
    const err = new ConnectorUnavailableError("jira", "timeout after 5000ms");
    expect(err.code).toBe("CONNECTOR_UNAVAILABLE");
    expect(err.detail).toContain("timeout");
  });
});
