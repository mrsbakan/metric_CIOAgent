import type { Redis } from "ioredis";
import { getRedisClient } from "./client.js";
import { RedisKey, RedisTTL } from "./keys.js";

export interface SessionCache {
  sessionId: string;
  tenantId:  string;
  userId:    string;
  roleId:    string;
  state:     string;
  context:   Record<string, unknown>;
}

export async function setSession(
  data: SessionCache,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.set(
    RedisKey.session(data.sessionId),
    JSON.stringify(data),
    "EX",
    RedisTTL.SESSION,
  );
}

export async function getSession(
  sessionId: string,
  client: Redis = getRedisClient(),
): Promise<SessionCache | null> {
  const raw = await client.get(RedisKey.session(sessionId));
  if (!raw) return null;
  return JSON.parse(raw) as SessionCache;
}

export async function deleteSession(
  sessionId: string,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.del(RedisKey.session(sessionId));
}

export async function refreshSessionTTL(
  sessionId: string,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.expire(RedisKey.session(sessionId), RedisTTL.SESSION);
}
