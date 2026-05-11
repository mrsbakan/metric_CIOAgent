import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

function createPool(overrides?: pg.PoolConfig): pg.Pool {
  return new Pool({
    host: process.env["POSTGRES_HOST"] ?? "localhost",
    port: Number(process.env["POSTGRES_PORT"] ?? 5432),
    database: process.env["POSTGRES_DB"] ?? "cio_agent",
    user: process.env["POSTGRES_USER"] ?? "cio_agent_app",
    password: process.env["POSTGRES_PASSWORD"],
    ssl: process.env["POSTGRES_SSL"] === "true",
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...overrides,
  });
}

// Main app DB pool — shared singleton
const pool = createPool();

export const db = drizzle(pool, { schema, logger: process.env["NODE_ENV"] === "development" });

// Audit DB pool — separate instance, INSERT-only
const auditPool = createPool({
  host: process.env["AUDIT_POSTGRES_HOST"] ?? "localhost",
  port: Number(process.env["AUDIT_POSTGRES_PORT"] ?? 5433),
  database: process.env["AUDIT_POSTGRES_DB"] ?? "cio_agent_audit",
  user: process.env["AUDIT_POSTGRES_USER"] ?? "cio_agent_audit_app",
  password: process.env["AUDIT_POSTGRES_PASSWORD"],
});

export const auditDb = drizzle(auditPool);

// Set tenant context on each connection before executing queries.
// Called by request middleware after JWT validation.
export async function withTenantContext<T>(
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      `SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`,
    );
    return fn();
  });
}

export type Db = typeof db;
export type AuditDb = typeof auditDb;
