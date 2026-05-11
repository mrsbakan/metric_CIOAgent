import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { Redis } from "ioredis";
import { JiraConnector } from "../jira.connector.js";
import {
  ConnectorAuthError,
  ConnectorNotFoundError,
  ConnectorRateLimitError,
  ConnectorUnavailableError,
} from "@cio-agent/connector-framework/errors";
import type { ConnectorConfig } from "@cio-agent/connector-framework/types";

// ── helpers ──────────────────────────────────────────────────────────────────

const mockConfig: ConnectorConfig = {
  id: "conn-jira-1",
  tenantId: "tenant-1",
  type: "jira",
  name: "Test JIRA",
  authConfig: {
    host: "https://test.atlassian.net",
    email: "user@test.com",
    apiToken: "secret-token",
  },
  fieldMapping: {},
  webhookConfig: {},
};

function makeRedis(cached: string | null = null): Redis {
  return {
    get: jest.fn<() => Promise<string | null>>().mockResolvedValue(cached),
    set: jest.fn<() => Promise<"OK">>().mockResolvedValue("OK"),
  } as unknown as Redis;
}

const rawIssue = {
  id: "10001",
  key: "PROJ-1",
  self: "https://test.atlassian.net/rest/api/3/issue/10001",
  fields: {
    summary: "Test issue",
    status: { name: "To Do" },
    issuetype: { name: "Task" },
    priority: { name: "Medium" },
    assignee: { displayName: "Jane Doe" },
    reporter: { displayName: "John Doe" },
    project: { key: "PROJ" },
    created: "2024-01-01T00:00:00.000Z",
    updated: "2024-01-02T00:00:00.000Z",
  },
};

afterEach(() => { jest.clearAllMocks(); });

function mockFetch(body: unknown, status = 200, headers: Record<string, string> = {}): void {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null } as unknown as Headers,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("JiraConnector.healthCheck", () => {
  it("returns healthy on successful /myself response", async () => {
    mockFetch({ accountId: "abc" });
    const connector = new JiraConnector(mockConfig, makeRedis());
    const health = await connector.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns unhealthy on auth failure", async () => {
    mockFetch("Unauthorized", 401);
    const connector = new JiraConnector(mockConfig, makeRedis());
    const health = await connector.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.error).toBeDefined();
  });

  it("returns unhealthy on network error", async () => {
    global.fetch = jest.fn<typeof fetch>().mockRejectedValue(new Error("ECONNREFUSED"));
    const connector = new JiraConnector(mockConfig, makeRedis());
    const health = await connector.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.error).toBeDefined();
  });
});

describe("JiraConnector.read — issue by key", () => {
  it("returns mapped issue for known key", async () => {
    mockFetch(rawIssue);
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.read({ resourceType: "issue", filters: { key: "PROJ-1" } });
    expect(result.data).toHaveLength(1);
    const issue = result.data[0] as import("../types.js").JiraIssue;
    expect(issue.key).toBe("PROJ-1");
    expect(issue.summary).toBe("Test issue");
    expect(issue.assignee).toBe("Jane Doe");
    expect(issue.url).toBe("https://test.atlassian.net/browse/PROJ-1");
  });

  it("throws ConnectorNotFoundError on 404", async () => {
    mockFetch("Not found", 404);
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "issue", filters: { key: "PROJ-999" } }),
    ).rejects.toBeInstanceOf(ConnectorNotFoundError);
  });

  it("throws ConnectorAuthError on 401", async () => {
    mockFetch("Unauthorized", 401);
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "issue", filters: { key: "PROJ-1" } }),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});

describe("JiraConnector.read — JQL search", () => {
  it("returns paginated issues", async () => {
    mockFetch({ issues: [rawIssue], total: 1, startAt: 0, maxResults: 50 });
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.read({ resourceType: "issue", query: "project = PROJ" });
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(1);
  });

  it("sets hasMore and cursor when more results exist", async () => {
    const issues = Array.from({ length: 50 }, (_, i) => ({ ...rawIssue, key: `PROJ-${i + 1}` }));
    mockFetch({ issues, total: 120, startAt: 0, maxResults: 50 });
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.read({ resourceType: "issue", query: "project = PROJ", limit: 50 });
    expect(result.hasMore).toBe(true);
    expect(result.cursor).toBe("50");
  });

  it("throws ConnectorRateLimitError on 429", async () => {
    mockFetch("", 429, { "Retry-After": "30" });
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "issue", query: "project = PROJ" }),
    ).rejects.toBeInstanceOf(ConnectorRateLimitError);
  });
});

describe("JiraConnector.read — projects", () => {
  it("returns list of projects", async () => {
    const projects = [{ id: "1", key: "PROJ", name: "Project One", projectTypeKey: "software" }];
    mockFetch(projects);
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.read({ resourceType: "project" });
    expect(result.data).toHaveLength(1);
    const project = result.data[0] as import("../types.js").JiraProject;
    expect(project.key).toBe("PROJ");
  });
});

describe("JiraConnector.read — unsupported resourceType", () => {
  it("throws AppError for unknown resourceType", async () => {
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "sprint" }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UNSUPPORTED_RESOURCE" });
  });
});

describe("JiraConnector.write — create issue", () => {
  it("creates an issue and returns result", async () => {
    mockFetch({ id: "10002", key: "PROJ-2", self: "..." });
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.write({
      resourceType: "issue",
      action: "create",
      idempotencyKey: "idem-001",
      payload: { projectKey: "PROJ", summary: "New issue", issueType: "Task" },
    });
    expect(result.resourceId).toBe("PROJ-2");
    expect(result.action).toBe("create");
    expect(result.externalUrl).toBe("https://test.atlassian.net/browse/PROJ-2");
    expect(result.idempotencyKey).toBe("idem-001");
  });

  it("returns cached result on duplicate idempotency key", async () => {
    const cached = {
      resourceId: "PROJ-2",
      resourceType: "issue",
      action: "create" as const,
      idempotencyKey: "idem-001",
    };
    const redis = makeRedis(JSON.stringify(cached));
    const connector = new JiraConnector(mockConfig, redis);
    const result = await connector.write({
      resourceType: "issue",
      action: "create",
      idempotencyKey: "idem-001",
      payload: { projectKey: "PROJ", summary: "New issue", issueType: "Task" },
    });
    expect(result.resourceId).toBe("PROJ-2");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("JiraConnector.write — update issue", () => {
  it("updates an issue and returns result", async () => {
    mockFetch(undefined, 204);
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.write({
      resourceType: "issue",
      action: "update",
      idempotencyKey: "idem-002",
      payload: { key: "PROJ-1", fields: { summary: "Updated summary" } },
    });
    expect(result.resourceId).toBe("PROJ-1");
    expect(result.action).toBe("update");
  });
});

describe("JiraConnector.write — transition issue", () => {
  it("transitions an issue and returns result", async () => {
    mockFetch(undefined, 204);
    const connector = new JiraConnector(mockConfig, makeRedis());
    const result = await connector.write({
      resourceType: "issue",
      action: "transition",
      idempotencyKey: "idem-003",
      payload: { key: "PROJ-1", transitionId: "31" },
    });
    expect(result.resourceId).toBe("PROJ-1");
    expect(result.action).toBe("transition");
  });
});

describe("JiraConnector.write — unsupported operation", () => {
  it("throws AppError for unknown resourceType/action combo", async () => {
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.write({
        resourceType: "project",
        action: "create",
        idempotencyKey: "idem-004",
        payload: {},
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_UNSUPPORTED_OPERATION" });
  });
});

describe("JiraHttpClient error mapping", () => {
  it("throws ConnectorUnavailableError on 5xx", async () => {
    mockFetch("Internal Server Error", 500);
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "issue", filters: { key: "PROJ-1" } }),
    ).rejects.toBeInstanceOf(ConnectorUnavailableError);
  });

  it("throws ConnectorAuthError on 403", async () => {
    mockFetch("Forbidden", 403);
    const connector = new JiraConnector(mockConfig, makeRedis());
    await expect(
      connector.read({ resourceType: "project" }),
    ).rejects.toBeInstanceOf(ConnectorAuthError);
  });
});
