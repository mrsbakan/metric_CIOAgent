export type {
  ConnectorConfig,
  ConnectorHealth,
  ConnectorReadParams,
  ConnectorReadResult,
  ConnectorWriteAction,
  ConnectorWriteParams,
  ConnectorWriteResult,
} from "./types.js";

export type { IConnector } from "./interface.js";
export { BaseConnector } from "./base.js";

export {
  ConnectorAuthError,
  ConnectorError,
  ConnectorIdempotencyConflictError,
  ConnectorNotFoundError,
  ConnectorRateLimitError,
  ConnectorUnavailableError,
} from "./errors.js";
