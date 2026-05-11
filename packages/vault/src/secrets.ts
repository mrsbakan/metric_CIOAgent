/**
 * Typed secret accessors.
 * Each function fetches from Vault and returns a strongly-typed object.
 * In-process caching is intentionally avoided — secrets are short-lived
 * and Vault handles caching/rotation.
 */
import { readSecret } from "./client.js";
import { VaultPath } from "./paths.js";

// ── System secrets ────────────────────────────────────────────────────────────

export interface PostgresSecret {
  host:     string;
  port:     string;
  db:       string;
  user:     string;
  password: string;
}

export async function getPostgresSecret(): Promise<PostgresSecret> {
  const s = await readSecret(VaultPath.system.postgres);
  return s.data as unknown as PostgresSecret;
}

export async function getAuditPostgresSecret(): Promise<PostgresSecret> {
  const s = await readSecret(VaultPath.system.postgresAudit);
  return s.data as unknown as PostgresSecret;
}

export interface RedisSecret {
  host:     string;
  port:     string;
  password: string;
}

export async function getRedisSecret(): Promise<RedisSecret> {
  const s = await readSecret(VaultPath.system.redis);
  return s.data as unknown as RedisSecret;
}

export interface JwtSecret {
  private_key: string;
  public_key:  string;
}

export async function getJwtSecret(): Promise<JwtSecret> {
  const s = await readSecret(VaultPath.system.jwt);
  return s.data as unknown as JwtSecret;
}

// ── Tenant secrets ────────────────────────────────────────────────────────────

export interface LlmSecret {
  api_key:  string;
  endpoint?: string;
  model?:   string;
}

export async function getLlmSecret(
  tenantId: string,
  provider: string,
): Promise<LlmSecret> {
  const s = await readSecret(VaultPath.tenant.llm(tenantId, provider));
  return s.data as unknown as LlmSecret;
}

export interface ConnectorSecret {
  auth_type:      string;  // "oauth2" | "api_token" | "basic" | "pat"
  client_id?:     string;
  client_secret?: string;
  api_token?:     string;
  username?:      string;
  password?:      string;
  instance_url?:  string;  // ServiceNow / JIRA host
  tenant_id?:     string;  // Azure AD
  webhook_secret?: string; // HMAC secret for webhook signature verification
}

export async function getConnectorSecret(
  tenantId: string,
  connectorType: string,
): Promise<ConnectorSecret> {
  const s = await readSecret(VaultPath.tenant.connector(tenantId, connectorType));
  return s.data as unknown as ConnectorSecret;
}

export interface EncryptionKeySecret {
  key: string;   // base64-encoded 256-bit AES key
  iv:  string;   // base64-encoded initialization vector seed
}

export async function getEncryptionKey(
  tenantId: string,
): Promise<EncryptionKeySecret> {
  const s = await readSecret(VaultPath.tenant.encryptionKey(tenantId));
  return s.data as unknown as EncryptionKeySecret;
}
