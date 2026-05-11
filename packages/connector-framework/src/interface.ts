import type {
  ConnectorConfig,
  ConnectorHealth,
  ConnectorReadParams,
  ConnectorReadResult,
  ConnectorWriteParams,
  ConnectorWriteResult,
} from "./types.js";

export interface IConnector<TReadData = unknown> {
  readonly config: ConnectorConfig;
  read(params: ConnectorReadParams): Promise<ConnectorReadResult<TReadData>>;
  write(params: ConnectorWriteParams): Promise<ConnectorWriteResult>;
  healthCheck(): Promise<ConnectorHealth>;
}
