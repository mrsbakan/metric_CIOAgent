import {
  ConnectorAuthError,
  ConnectorNotFoundError,
  ConnectorRateLimitError,
  ConnectorUnavailableError,
} from "@cio-agent/connector-framework/errors";
import type { JiraAuthConfig } from "./types.js";

export class JiraHttpClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: JiraAuthConfig) {
    this.baseUrl = config.host.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new ConnectorUnavailableError(
        "jira",
        err instanceof Error ? err.message : "Network error",
      );
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    }

    return this.mapError(response);
  }

  private async mapError(response: Response): Promise<never> {
    const body = await response.text().catch(() => "");

    if (response.status === 401 || response.status === 403) {
      throw new ConnectorAuthError("jira");
    }
    if (response.status === 404) {
      throw new ConnectorNotFoundError("jira", body);
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const retryAfterMs = retryAfter !== null ? parseInt(retryAfter, 10) * 1000 : undefined;
      throw new ConnectorRateLimitError("jira", retryAfterMs);
    }
    throw new ConnectorUnavailableError("jira", `HTTP ${response.status.toString()}: ${body}`);
  }
}
