import { AppError } from "@cio-agent/shared/errors";

export class ConnectorError extends AppError {
  constructor(
    code: string,
    message: string,
    public readonly connectorType: string,
    detail?: string,
  ) {
    super(code, message, detail);
    this.name = "ConnectorError";
  }
}

export class ConnectorAuthError extends ConnectorError {
  constructor(connectorType: string) {
    super(
      "CONNECTOR_AUTH_FAILED",
      "Connector authentication failed",
      connectorType,
      `Connector type: ${connectorType}`,
    );
    this.name = "ConnectorAuthError";
  }
}

export class ConnectorRateLimitError extends ConnectorError {
  constructor(connectorType: string, retryAfterMs?: number) {
    super(
      "CONNECTOR_RATE_LIMITED",
      "Connector rate limit exceeded",
      connectorType,
      retryAfterMs !== undefined ? `Retry after: ${retryAfterMs.toString()}ms` : undefined,
    );
    this.name = "ConnectorRateLimitError";
  }
}

export class ConnectorNotFoundError extends ConnectorError {
  constructor(connectorType: string, resourceId: string) {
    super(
      "CONNECTOR_RESOURCE_NOT_FOUND",
      "Connector resource not found",
      connectorType,
      `Resource: ${resourceId}`,
    );
    this.name = "ConnectorNotFoundError";
  }
}

export class ConnectorIdempotencyConflictError extends ConnectorError {
  constructor(connectorType: string, idempotencyKey: string) {
    super(
      "CONNECTOR_IDEMPOTENCY_CONFLICT",
      "Duplicate write detected — idempotency key already consumed",
      connectorType,
      `Idempotency key: ${idempotencyKey}`,
    );
    this.name = "ConnectorIdempotencyConflictError";
  }
}

export class ConnectorUnavailableError extends ConnectorError {
  constructor(connectorType: string, detail?: string) {
    super(
      "CONNECTOR_UNAVAILABLE",
      "Connector is unreachable",
      connectorType,
      detail,
    );
    this.name = "ConnectorUnavailableError";
  }
}
