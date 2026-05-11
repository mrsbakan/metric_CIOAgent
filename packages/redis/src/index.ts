export { getRedisClient, pingRedis, closeRedisClient } from "./client.js";
export { RedisKey, RedisTTL } from "./keys.js";
export {
  deductCredits,
  getBalance,
  loadCredits,
  setBalance,
  setRoleQuota,
  getRoleQuota,
  type CreditResult,
} from "./credits.js";
export { acquireLock, isLocked, type LockHandle } from "./lock.js";
export {
  setSession,
  getSession,
  deleteSession,
  refreshSessionTTL,
  type SessionCache,
} from "./session.js";
export {
  publishEvent,
  ensureConsumerGroup,
  readEvents,
  acknowledgeEvent,
  type StreamEvent,
  type ConsumedEvent,
} from "./streams.js";
export {
  setLicense,
  getLicense,
  invalidateLicense,
  type LicenseCache,
} from "./license.js";
