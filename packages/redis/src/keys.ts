/**
 * Typed Redis key builders.
 * All keys follow the structure defined in architecture.md § Redis Key Structure.
 * Never construct keys by hand — always use these functions.
 */

export const RedisKey = {
  /** Agent session state. TTL: 24h */
  session(sessionId: string): string {
    return `session:${sessionId}`;
  },

  /** Current credit balance for a tenant (global scope). TTL: none — persisted */
  credit(tenantId: string): string {
    return `credit:${tenantId}:global`;
  },

  /** Role-scoped credit quota for a tenant. TTL: none — persisted */
  creditQuota(tenantId: string, roleId: string): string {
    return `credit_quota:${tenantId}:${roleId}`;
  },

  /** License JWT cache. TTL: 1h */
  license(tenantId: string): string {
    return `license:${tenantId}`;
  },

  /** Action mutex lock (idempotency key). TTL: 5min */
  lock(idempotencyKey: string): string {
    return `lock:${idempotencyKey}`;
  },

  /** Redis Streams event bus channel per tenant */
  eventStream(tenantId: string): string {
    return `events:${tenantId}`;
  },

  /** Stored refresh token metadata. TTL: 7 days */
  refreshToken(jti: string): string {
    return `token:refresh:${jti}`;
  },

  /** Access token blacklist entry (post-logout). TTL: remaining token lifetime */
  tokenBlacklist(jti: string): string {
    return `token:blacklist:${jti}`;
  },

  /** Connector write idempotency guard. TTL: 24h */
  connectorIdempotency(connectorId: string, idempotencyKey: string): string {
    return `connector:idempotency:${connectorId}:${idempotencyKey}`;
  },

  /** Active connector references for background polling. Persistent Redis Set. */
  activeConnectors(type: string): string {
    return `active:connectors:${type}`;
  },

  /** DLQ retry guard — prevents re-processing the same event within the retry interval. TTL: 5 min */
  connectorRetryGuard(eventId: string): string {
    return `connector:retry:guard:${eventId}`;
  },

  /** Approval processing mutex — prevents duplicate approval requests per session. TTL: 48h */
  approvalMutex(sessionId: string): string {
    return `approval:mutex:${sessionId}`;
  },
} as const;

// TTLs in seconds — single source of truth
export const RedisTTL = {
  SESSION:                24 * 60 * 60,       // 24 hours
  LICENSE:                60 * 60,            // 1 hour
  LOCK:                   5 * 60,             // 5 minutes
  ACCESS_TOKEN:           15 * 60,            // 15 minutes
  REFRESH_TOKEN:          7 * 24 * 60 * 60,  // 7 days
  CONNECTOR_IDEMPOTENCY:  24 * 60 * 60,       // 24 hours
  CONNECTOR_RETRY_GUARD:  5  * 60,            // 5 minutes
  APPROVAL_MUTEX:         48 * 60 * 60,       // 48 hours
} as const;
