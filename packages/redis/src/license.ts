import type { Redis } from "ioredis";
import { getRedisClient } from "./client.js";
import { RedisKey, RedisTTL } from "./keys.js";

export interface LicenseCache {
  tenantId:    string;
  packageCode: string;
  features:    Record<string, boolean>;
  limits:      Record<string, number>;
  expiresAt:   number; // Unix timestamp
  isReadOnly:  boolean;
}

export async function setLicense(
  data: LicenseCache,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.set(
    RedisKey.license(data.tenantId),
    JSON.stringify(data),
    "EX",
    RedisTTL.LICENSE,
  );
}

export async function getLicense(
  tenantId: string,
  client: Redis = getRedisClient(),
): Promise<LicenseCache | null> {
  const raw = await client.get(RedisKey.license(tenantId));
  if (!raw) return null;
  return JSON.parse(raw) as LicenseCache;
}

export async function invalidateLicense(
  tenantId: string,
  client: Redis = getRedisClient(),
): Promise<void> {
  await client.del(RedisKey.license(tenantId));
}
