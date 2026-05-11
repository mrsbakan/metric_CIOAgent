/**
 * Vault HTTP API client — KV v2.
 *
 * Auth strategy:
 *   - Dev/staging: VAULT_TOKEN env var (root token in dev mode)
 *   - Production K8s: token is injected by Vault agent sidecar into
 *     /vault/secrets/ as files — code reads from there via readFileSync.
 *     The VAULT_TOKEN env var is populated by the sidecar automatically.
 *
 * Code never constructs or stores raw secrets — it fetches on demand
 * and caches only in-process for the TTL specified per secret type.
 */

const VAULT_ADDR  = process.env["VAULT_ADDR"]  ?? "http://localhost:8200";
const VAULT_MOUNT = process.env["VAULT_MOUNT_PATH"] ?? "secret/cioagent";
const ENV         = process.env["NODE_ENV"] ?? "development";

function getToken(): string {
  const token = process.env["VAULT_TOKEN"];
  if (!token) throw new Error("[vault] VAULT_TOKEN is not set");
  return token;
}

export interface VaultSecret {
  data: Record<string, string>;
  metadata: {
    created_time: string;
    version:      number;
  };
}

/**
 * Read a KV v2 secret. Path is relative to the mount + env prefix.
 * e.g. readSecret("system/postgres") → GET /v1/secret/cioagent/data/<env>/system/postgres
 */
export async function readSecret(path: string): Promise<VaultSecret> {
  const url = `${VAULT_ADDR}/v1/${VAULT_MOUNT}/data/${ENV}/${path}`;

  const res = await fetch(url, {
    headers: { "X-Vault-Token": getToken() },
  });

  if (res.status === 404) {
    throw new Error(`[vault] secret not found: ${ENV}/${path}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[vault] ${res.status} reading ${path}: ${body}`);
  }

  const json = await res.json() as { data: VaultSecret };
  return json.data;
}

/**
 * Write a KV v2 secret (used by init scripts and tests only).
 * Application code should never write secrets at runtime.
 */
export async function writeSecret(
  path: string,
  data: Record<string, string>,
): Promise<void> {
  const url = `${VAULT_ADDR}/v1/${VAULT_MOUNT}/data/${ENV}/${path}`;

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "X-Vault-Token": getToken(),
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ data }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`[vault] ${res.status} writing ${path}: ${body}`);
  }
}

export async function vaultHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${VAULT_ADDR}/v1/sys/health`, {
      headers: { "X-Vault-Token": getToken() },
    });
    // 200 = active, 429 = standby — both usable
    return res.status === 200 || res.status === 429;
  } catch {
    return false;
  }
}
