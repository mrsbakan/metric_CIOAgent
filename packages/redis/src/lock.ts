import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { getRedisClient } from "./client.js";
import { RedisKey, RedisTTL } from "./keys.js";

/**
 * Mutex lock via SET NX PX.
 *
 * Ownership token prevents a lock holder from accidentally releasing
 * another holder's lock (e.g. after a timeout expiry + re-acquisition).
 */

const UNLOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export interface LockHandle {
  release(): Promise<void>;
}

/**
 * Acquires a mutex lock. Returns null if the key is already locked.
 *
 * @param idempotencyKey - Unique key for the action being locked
 * @param ttlSeconds     - Lock TTL in seconds (default: 5 minutes)
 */
export async function acquireLock(
  idempotencyKey: string,
  ttlSeconds: number = RedisTTL.LOCK,
  client: Redis = getRedisClient(),
): Promise<LockHandle | null> {
  const key   = RedisKey.lock(idempotencyKey);
  const token = randomUUID();

  const result = await client.set(key, token, "EX", ttlSeconds, "NX");

  if (result !== "OK") {
    // Key already exists — another holder owns the lock
    return null;
  }

  return {
    async release(): Promise<void> {
      // Only delete if we still own the lock (token matches)
      await client.eval(UNLOCK_SCRIPT, 1, key, token);
    },
  };
}

/**
 * Returns true if the idempotency key has already been processed.
 * Used to short-circuit duplicate action submissions.
 */
export async function isLocked(
  idempotencyKey: string,
  client: Redis = getRedisClient(),
): Promise<boolean> {
  const exists = await client.exists(RedisKey.lock(idempotencyKey));
  return exists === 1;
}
