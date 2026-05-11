/**
 * Secret path constants — single source of truth.
 * All paths are relative to: secret/cioagent/data/<env>/
 *
 * Never construct paths by hand in application code.
 */
export const VaultPath = {
  // ── System secrets (service-level, not per-tenant) ─────────────────────────
  system: {
    postgres:      "system/postgres",
    postgresAudit: "system/postgres-audit",
    redis:         "system/redis",
    jwt:           "system/jwt",
  },

  // ── Tenant secrets (per-tenant, per-customer) ──────────────────────────────
  tenant: {
    /** LLM provider API key for a specific tenant */
    llm(tenantId: string, provider: string): string {
      return `tenant/${tenantId}/llm/${provider}`;
    },
    /** Connector auth config for a specific tenant + connector type */
    connector(tenantId: string, connectorType: string): string {
      return `tenant/${tenantId}/connector/${connectorType}`;
    },
    /** AES-256 encryption key for tenant memory + prompt content */
    encryptionKey(tenantId: string): string {
      return `tenant/${tenantId}/encryption-key`;
    },
  },
} as const;
