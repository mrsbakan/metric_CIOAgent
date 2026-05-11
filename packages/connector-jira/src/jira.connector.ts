import type { Redis } from "ioredis";
import { BaseConnector } from "@cio-agent/connector-framework/base";
import type {
  ConnectorConfig,
  ConnectorHealth,
  ConnectorReadParams,
  ConnectorReadResult,
  ConnectorWriteParams,
  ConnectorWriteResult,
} from "@cio-agent/connector-framework/types";
import { AppError } from "@cio-agent/shared/errors";
import { JiraHttpClient } from "./client.js";
import { checkIdempotency, setIdempotency } from "./idempotency.js";
import type {
  JiraApiIssue,
  JiraApiProject,
  JiraAuthConfig,
  JiraCreateIssueResponse,
  JiraIssue,
  JiraProject,
  JiraSearchResponse,
} from "./types.js";

export type JiraReadData = JiraIssue | JiraProject;

export class JiraConnector extends BaseConnector<JiraReadData> {
  private readonly http: JiraHttpClient;

  constructor(
    config: ConnectorConfig,
    private readonly redis: Redis,
  ) {
    super(config);
    const auth = config.authConfig as unknown as JiraAuthConfig;
    this.http = new JiraHttpClient(auth);
  }

  async read(params: ConnectorReadParams): Promise<ConnectorReadResult<JiraReadData>> {
    if (params.resourceType === "project") {
      return this.readProjects();
    }
    if (params.resourceType === "issue") {
      const key = params.filters?.["key"];
      if (typeof key === "string") {
        return this.readIssueByKey(key);
      }
      return this.searchIssues(params);
    }
    throw new AppError(
      "CONNECTOR_UNSUPPORTED_RESOURCE",
      `JIRA connector does not support resourceType: ${params.resourceType}`,
    );
  }

  async write(params: ConnectorWriteParams): Promise<ConnectorWriteResult> {
    const cached = await checkIdempotency(this.redis, this.config.id, params.idempotencyKey);
    if (cached !== null) return cached;

    let result: ConnectorWriteResult;

    if (params.resourceType === "issue" && params.action === "create") {
      result = await this.createIssue(params);
    } else if (params.resourceType === "issue" && params.action === "update") {
      result = await this.updateIssue(params);
    } else if (params.resourceType === "issue" && params.action === "transition") {
      result = await this.transitionIssue(params);
    } else {
      throw new AppError(
        "CONNECTOR_UNSUPPORTED_OPERATION",
        `JIRA connector does not support ${params.action} on ${params.resourceType}`,
      );
    }

    await setIdempotency(this.redis, this.config.id, params.idempotencyKey, result);
    return result;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const start = Date.now();
    try {
      await this.http.get("/rest/api/3/myself");
      return { healthy: true, latencyMs: Date.now() - start, checkedAt: new Date() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { healthy: false, error: message, checkedAt: new Date() };
    }
  }

  private async readIssueByKey(key: string): Promise<ConnectorReadResult<JiraIssue>> {
    const raw = await this.http.get<JiraApiIssue>(`/rest/api/3/issue/${key}`);
    return { data: [this.mapIssue(raw)], hasMore: false, total: 1 };
  }

  private async searchIssues(params: ConnectorReadParams): Promise<ConnectorReadResult<JiraIssue>> {
    const jql = params.query ?? "ORDER BY created DESC";
    const maxResults = params.limit ?? 50;
    const startAt = params.cursor !== undefined ? parseInt(params.cursor, 10) : 0;

    const res = await this.http.post<JiraSearchResponse>("/rest/api/3/issue/search", {
      jql,
      maxResults,
      startAt,
      fields: ["summary", "status", "issuetype", "priority", "assignee", "reporter", "project", "created", "updated"],
    });

    const nextStart = startAt + res.issues.length;
    const hasMore = nextStart < res.total;

    return {
      data: res.issues.map((i) => this.mapIssue(i)),
      hasMore,
      ...(hasMore ? { cursor: String(nextStart) } : {}),
      total: res.total,
    };
  }

  private async readProjects(): Promise<ConnectorReadResult<JiraProject>> {
    const projects = await this.http.get<JiraApiProject[]>("/rest/api/3/project");
    return {
      data: projects.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        projectTypeKey: p.projectTypeKey,
      })),
      hasMore: false,
      total: projects.length,
    };
  }

  private async createIssue(params: ConnectorWriteParams): Promise<ConnectorWriteResult> {
    const payload = params.payload as {
      projectKey: string;
      summary: string;
      issueType: string;
      description?: unknown;
      priority?: string;
      assigneeAccountId?: string;
    };

    const res = await this.http.post<JiraCreateIssueResponse>("/rest/api/3/issue", {
      fields: {
        project: { key: payload.projectKey },
        summary: payload.summary,
        issuetype: { name: payload.issueType },
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.priority !== undefined ? { priority: { name: payload.priority } } : {}),
        ...(payload.assigneeAccountId !== undefined ? { assignee: { accountId: payload.assigneeAccountId } } : {}),
      },
    });

    const auth = this.config.authConfig as unknown as JiraAuthConfig;
    return {
      resourceId: res.key,
      resourceType: "issue",
      action: "create",
      idempotencyKey: params.idempotencyKey,
      externalUrl: `${auth.host}/browse/${res.key}`,
      raw: res,
    };
  }

  private async updateIssue(params: ConnectorWriteParams): Promise<ConnectorWriteResult> {
    const payload = params.payload as { key: string; fields: Record<string, unknown> };

    await this.http.put(`/rest/api/3/issue/${payload.key}`, { fields: payload.fields });

    const auth = this.config.authConfig as unknown as JiraAuthConfig;
    return {
      resourceId: payload.key,
      resourceType: "issue",
      action: "update",
      idempotencyKey: params.idempotencyKey,
      externalUrl: `${auth.host}/browse/${payload.key}`,
    };
  }

  private async transitionIssue(params: ConnectorWriteParams): Promise<ConnectorWriteResult> {
    const payload = params.payload as { key: string; transitionId: string };

    await this.http.post(`/rest/api/3/issue/${payload.key}/transitions`, {
      transition: { id: payload.transitionId },
    });

    const auth = this.config.authConfig as unknown as JiraAuthConfig;
    return {
      resourceId: payload.key,
      resourceType: "issue",
      action: "transition",
      idempotencyKey: params.idempotencyKey,
      externalUrl: `${auth.host}/browse/${payload.key}`,
    };
  }

  private mapIssue(raw: JiraApiIssue): JiraIssue {
    const auth = this.config.authConfig as unknown as JiraAuthConfig;
    return {
      id: raw.id,
      key: raw.key,
      summary: raw.fields.summary,
      status: raw.fields.status.name,
      issueType: raw.fields.issuetype.name,
      priority: raw.fields.priority?.name ?? null,
      assignee: raw.fields.assignee?.displayName ?? null,
      reporter: raw.fields.reporter?.displayName ?? null,
      project: raw.fields.project.key,
      created: raw.fields.created,
      updated: raw.fields.updated,
      url: `${auth.host}/browse/${raw.key}`,
    };
  }
}
