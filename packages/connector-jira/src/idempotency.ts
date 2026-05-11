import type { Redis } from "ioredis";
import { RedisKey, RedisTTL } from "@cio-agent/redis/keys";
import type { ConnectorWriteResult } from "@cio-agent/connector-framework/types";

export async function checkIdempotency(
  redis: Redis,
  connectorId: string,
  idempotencyKey: string,
): Promise<ConnectorWriteResult | null> {
  const key = RedisKey.connectorIdempotency(connectorId, idempotencyKey);
  const cached = await redis.get(key);
  if (cached === null) return null;
  return JSON.parse(cached) as ConnectorWriteResult;
}

export async function setIdempotency(
  redis: Redis,
  connectorId: string,
  idempotencyKey: string,
  result: ConnectorWriteResult,
): Promise<void> {
  const key = RedisKey.connectorIdempotency(connectorId, idempotencyKey);
  await redis.set(key, JSON.stringify(result), "EX", RedisTTL.CONNECTOR_IDEMPOTENCY);
}
