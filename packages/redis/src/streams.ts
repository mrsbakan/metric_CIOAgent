import type { Redis } from "ioredis";
import { getRedisClient } from "./client.js";
import { RedisKey } from "./keys.js";

export interface StreamEvent {
  tenantId:    string;
  eventType:   string;
  connectorId?: string;
  payload:     Record<string, unknown>;
}

export interface ConsumedEvent {
  id:    string;
  event: StreamEvent;
}

/**
 * Publish an event to the tenant's Redis Stream.
 * Returns the stream entry ID assigned by Redis.
 */
export async function publishEvent(
  event: StreamEvent,
  client: Redis = getRedisClient(),
): Promise<string> {
  const key = RedisKey.eventStream(event.tenantId);

  const id = await client.xadd(
    key,
    "*",                                // auto-generated ID
    "event_type",  event.eventType,
    "connector_id", event.connectorId ?? "",
    "payload",     JSON.stringify(event.payload),
    "tenant_id",   event.tenantId,
  );

  if (!id) throw new Error("[streams] xadd returned null");
  return id;
}

/**
 * Ensure a consumer group exists for the given tenant stream.
 * Safe to call multiple times — uses MKSTREAM + SETID $|0.
 */
export async function ensureConsumerGroup(
  tenantId: string,
  group: string,
  client: Redis = getRedisClient(),
): Promise<void> {
  const key = RedisKey.eventStream(tenantId);
  try {
    // "0" = read from the beginning; use "$" for new-events-only
    await client.xgroup("CREATE", key, group, "0", "MKSTREAM");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // BUSYGROUP = group already exists; safe to ignore
    if (!msg.includes("BUSYGROUP")) throw err;
  }
}

/**
 * Read pending events for a consumer in a group.
 * Returns up to `count` events. Call `acknowledgeEvent` after processing.
 */
export async function readEvents(
  tenantId: string,
  group: string,
  consumer: string,
  count = 10,
  blockMs = 0,
  client: Redis = getRedisClient(),
): Promise<ConsumedEvent[]> {
  const key = RedisKey.eventStream(tenantId);

  const result = await client.xreadgroup(
    "GROUP", group, consumer,
    "COUNT", count,
    ...(blockMs > 0 ? ["BLOCK", blockMs] : []),
    "STREAMS", key, ">",
  ) as Array<[string, Array<[string, string[]]>]> | null;

  if (!result) return [];

  const [, entries] = result[0]!;
  return entries.map(([id, fields]) => {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]!] = fields[i + 1]!;
    }
    return {
      id,
      event: {
        tenantId:    map["tenant_id"] ?? tenantId,
        eventType:   map["event_type"] ?? "",
        connectorId: map["connector_id"] ?? undefined,
        payload:     JSON.parse(map["payload"] ?? "{}") as Record<string, unknown>,
      },
    };
  });
}

/**
 * Acknowledge a processed event — removes it from the PEL (pending entry list).
 */
export async function acknowledgeEvent(
  tenantId: string,
  group: string,
  eventId: string,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.xack(RedisKey.eventStream(tenantId), group, eventId);
}
