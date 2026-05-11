import type { IConnector } from "./interface.js";
import type {
  ConnectorConfig,
  ConnectorHealth,
  ConnectorReadParams,
  ConnectorReadResult,
  ConnectorWriteParams,
  ConnectorWriteResult,
} from "./types.js";

export abstract class BaseConnector<TReadData = unknown>
  implements IConnector<TReadData>
{
  constructor(readonly config: ConnectorConfig) {}

  abstract read(params: ConnectorReadParams): Promise<ConnectorReadResult<TReadData>>;
  abstract write(params: ConnectorWriteParams): Promise<ConnectorWriteResult>;
  abstract healthCheck(): Promise<ConnectorHealth>;
}
