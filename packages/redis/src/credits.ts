import type { Redis } from "ioredis";
import { getRedisClient } from "./client.js";
import { RedisKey } from "./keys.js";

export type CreditResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: "INSUFFICIENT_CREDITS" | "NO_BALANCE" };

/**
 * Atomic credit deduction via Lua script.
 *
 * Guarantees:
 * - Check and deduct happen in a single atomic operation — no race condition.
 * - Two concurrent requests with insufficient combined balance cannot both succeed.
 * - Returns the remaining balance after deduction on success.
 *
 * The Lua script runs on the Redis server — atomically, no two scripts
 * interleave on the same key.
 */
const DEDUCT_SCRIPT = `
local key     = KEYS[1]
local cost    = tonumber(ARGV[1])
local current = redis.call('GET', key)

if current == false then
  return redis.error_reply('NO_BALANCE')
end

local balance = tonumber(current)

if balance < cost then
  return redis.error_reply('INSUFFICIENT_CREDITS')
end

local remaining = redis.call('DECRBY', key, cost)
return remaining
`;

export async function deductCredits(
  tenantId: string,
  cost: number,
  client: Redis = getRedisClient(),
): Promise<CreditResult> {
  const key = RedisKey.credit(tenantId);

  try {
    const remaining = await client.eval(DEDUCT_SCRIPT, 1, key, cost) as number;
    return { ok: true, remaining };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("INSUFFICIENT_CREDITS")) {
      return { ok: false, reason: "INSUFFICIENT_CREDITS" };
    }
    if (message.includes("NO_BALANCE")) {
      return { ok: false, reason: "NO_BALANCE" };
    }
    throw err;
  }
}

export async function getBalance(
  tenantId: string,
  client: Redis = getRedisClient(),
): Promise<number | null> {
  const raw = await client.get(RedisKey.credit(tenantId));
  return raw === null ? null : Number(raw);
}

export async function loadCredits(
  tenantId: string,
  amount: number,
  client: Redis = getRedisClient(),
): Promise<number> {
  const key = RedisKey.credit(tenantId);
  // INCRBY is atomic — safe to call concurrently
  return client.incrby(key, amount);
}

export async function setBalance(
  tenantId: string,
  amount: number,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.set(RedisKey.credit(tenantId), amount);
}

export async function getRoleQuota(
  tenantId: string,
  roleId: string,
  client: Redis = getRedisClient(),
): Promise<number | null> {
  const raw = await client.get(RedisKey.creditQuota(tenantId, roleId));
  return raw === null ? null : Number(raw);
}

export async function setRoleQuota(
  tenantId: string,
  roleId: string,
  quota: number,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.set(RedisKey.creditQuota(tenantId, roleId), quota);
}
