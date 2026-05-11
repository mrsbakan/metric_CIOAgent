/**
 * RLS Cross-Tenant Isolation Test
 *
 * Integration test — requires a real PostgreSQL instance with:
 *   - 0000_initial_schema.sql applied
 *   - rls_policies.sql applied
 *
 * Run: docker compose up postgres -d && npm run test:integration
 *
 * What it verifies:
 *   - Tenant A cannot see Tenant B's rows (and vice versa)
 *   - Unset tenant_id blocks ALL rows (returns empty)
 *   - INSERT with wrong tenant_id is rejected
 *   - credit_ledger UPDATE is rejected
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import pg from "pg";

const { Pool } = pg;

// Direct pool without tenant context — used to seed data as a superuser
let superPool: pg.Pool;
// App user pool — tenant context set per transaction
let appPool: pg.Pool;

const TENANT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function setTenant(client: pg.PoolClient, tenantId: string): Promise<void> {
  await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
}

async function clearTenant(client: pg.PoolClient): Promise<void> {
  await client.query(`SET LOCAL app.tenant_id = ''`);
}

beforeAll(async () => {
  superPool = new Pool({
    host:     process.env["POSTGRES_HOST"] ?? "localhost",
    port:     Number(process.env["POSTGRES_PORT"] ?? 5432),
    database: process.env["POSTGRES_DB"] ?? "cio_agent",
    user:     process.env["POSTGRES_SUPERUSER"] ?? "postgres",
    password: process.env["POSTGRES_SUPERUSER_PASSWORD"] ?? "change_me",
  });

  appPool = new Pool({
    host:     process.env["POSTGRES_HOST"] ?? "localhost",
    port:     Number(process.env["POSTGRES_PORT"] ?? 5432),
    database: process.env["POSTGRES_DB"] ?? "cio_agent",
    user:     process.env["POSTGRES_USER"] ?? "cio_agent_app",
    password: process.env["POSTGRES_PASSWORD"] ?? "change_me",
  });

  // Seed: two accounts (= two tenants)
  await superPool.query(`
    INSERT INTO accounts (id, name, status)
    VALUES
      ('${TENANT_A}', 'Tenant A', 'active'),
      ('${TENANT_B}', 'Tenant B', 'active')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Seed: one role per tenant
  await superPool.query(`
    INSERT INTO roles (id, tenant_id, name, permissions)
    VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '${TENANT_A}', 'CIO-A', '{}'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '${TENANT_B}', 'CIO-B', '{}')
    ON CONFLICT (id) DO NOTHING;
  `);

  // Seed: one user per tenant
  await superPool.query(`
    INSERT INTO users (id, tenant_id, account_id, email, user_type, status)
    VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '${TENANT_A}', '${TENANT_A}', 'user@tenant-a.test', 'admin', 'active'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', '${TENANT_B}', '${TENANT_B}', 'user@tenant-b.test', 'admin', 'active')
    ON CONFLICT (id) DO NOTHING;
  `);
});

afterAll(async () => {
  // Clean up seed data
  await superPool.query(`
    DELETE FROM users WHERE email IN ('user@tenant-a.test', 'user@tenant-b.test');
    DELETE FROM roles WHERE name IN ('CIO-A', 'CIO-B');
    DELETE FROM accounts WHERE id IN ('${TENANT_A}', '${TENANT_B}');
  `);
  await superPool.end();
  await appPool.end();
});

// ─── Core isolation tests ─────────────────────────────────────────────────────

describe("RLS — tenant isolation", () => {
  it("Tenant A sees only its own users", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_A);

      const { rows } = await client.query<{ email: string }>(
        "SELECT email FROM users",
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe("user@tenant-a.test");

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("Tenant B sees only its own users", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_B);

      const { rows } = await client.query<{ email: string }>(
        "SELECT email FROM users",
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe("user@tenant-b.test");

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("Tenant A cannot read Tenant B's roles", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_A);

      const { rows } = await client.query<{ name: string }>(
        "SELECT name FROM roles WHERE name = 'CIO-B'",
      );

      // RLS filters out CIO-B — not visible to Tenant A
      expect(rows).toHaveLength(0);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("No tenant context set — returns zero rows from all tenant tables", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await clearTenant(client);

      const usersResult = await client.query("SELECT * FROM users");
      const rolesResult = await client.query("SELECT * FROM roles");

      expect(usersResult.rows).toHaveLength(0);
      expect(rolesResult.rows).toHaveLength(0);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("Tenant A cannot INSERT a row with Tenant B's tenant_id", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_A);

      await expect(
        client.query(`
          INSERT INTO memory_shared (tenant_id, key, value)
          VALUES ('${TENANT_B}', 'poisoned-key', 'payload')
        `),
      ).rejects.toThrow();

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});

// ─── Append-only enforcement ──────────────────────────────────────────────────

describe("RLS — credit_ledger append-only", () => {
  let ledgerRowId: string;

  beforeAll(async () => {
    // Seed: minimal account_application and a ledger row via superuser
    await superPool.query(`
      INSERT INTO packages (id, name, code, status, application_id, config)
      VALUES ('cccccccc-cccc-cccc-cccc-000000000001', 'Test Pkg', 'test-rls', 'active', 'cio-agent', '{}')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO account_applications (id, account_id, application_id, package_id, status)
      VALUES ('cccccccc-cccc-cccc-cccc-000000000002', '${TENANT_A}', 'cio-agent', 'cccccccc-cccc-cccc-cccc-000000000001', 'active')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO credit_ledger (id, tenant_id, account_application_id, amount, type, action_type)
      VALUES ('cccccccc-cccc-cccc-cccc-000000000003', '${TENANT_A}', 'cccccccc-cccc-cccc-cccc-000000000002', 1000, 'credit', 'chatbot_simple')
      ON CONFLICT (id) DO NOTHING;
    `);
    ledgerRowId = "cccccccc-cccc-cccc-cccc-000000000003";
  });

  afterAll(async () => {
    await superPool.query(`
      DELETE FROM credit_ledger WHERE id = '${ledgerRowId}';
      DELETE FROM account_applications WHERE id = 'cccccccc-cccc-cccc-cccc-000000000002';
      DELETE FROM packages WHERE id = 'cccccccc-cccc-cccc-cccc-000000000001';
    `);
  });

  it("App user cannot UPDATE credit_ledger", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_A);

      await expect(
        client.query(
          `UPDATE credit_ledger SET amount = 99999 WHERE id = '${ledgerRowId}'`,
        ),
      ).rejects.toThrow();

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("App user cannot DELETE from credit_ledger", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_A);

      await expect(
        client.query(
          `DELETE FROM credit_ledger WHERE id = '${ledgerRowId}'`,
        ),
      ).rejects.toThrow();

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("Tenant A cannot read Tenant B's credit_ledger rows", async () => {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await setTenant(client, TENANT_B);

      const { rows } = await client.query(
        `SELECT id FROM credit_ledger WHERE id = '${ledgerRowId}'`,
      );

      // RLS hides Tenant A's row from Tenant B
      expect(rows).toHaveLength(0);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
