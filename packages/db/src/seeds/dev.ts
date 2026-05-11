/**
 * Dev seed — idempotent (safe to run multiple times).
 * Creates one tenant (account), three roles, and one admin user.
 * NOT for production — dev/staging only.
 */
import { db } from "../client.js";
import { accounts, accountApplications, packages } from "../schema/accounts.js";
import { users, roles, userRoles } from "../schema/users-roles.js";
import { eq } from "drizzle-orm";

const DEV_ACCOUNT_NAME = "Dev Tenant";
const APP_ID = "cio-agent";

async function seed(): Promise<void> {
  console.log("Seeding dev data...");

  // 1. Package
  const [existingPackage] = await db
    .select()
    .from(packages)
    .where(eq(packages.code, "enterprise-dev"))
    .limit(1);

  const pkg = existingPackage ?? (await db
    .insert(packages)
    .values({
      name:           "Enterprise Dev",
      code:           "enterprise-dev",
      status:         "active",
      application_id: APP_ID,
      config: {
        user_limit:       999,
        role_limit:       999,
        monthly_credits:  999_999,
        connectors:       ["jira", "servicenow", "azure", "spirai"],
        notification_channels: ["email", "in-app"],
        skill_module:     true,
        role_based_quotas: true,
      },
    })
    .returning()
    .then((r) => r[0]!));

  // 2. Account
  const [existingAccount] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.name, DEV_ACCOUNT_NAME))
    .limit(1);

  const account = existingAccount ?? (await db
    .insert(accounts)
    .values({ name: DEV_ACCOUNT_NAME, status: "active" })
    .returning()
    .then((r) => r[0]!));

  // 3. Account Application
  const [existingApp] = await db
    .select()
    .from(accountApplications)
    .where(eq(accountApplications.account_id, account.id))
    .limit(1);

  const accountApp = existingApp ?? (await db
    .insert(accountApplications)
    .values({
      account_id:     account.id,
      application_id: APP_ID,
      package_id:     pkg.id,
      status:         "active",
      activated_at:   new Date(),
    })
    .returning()
    .then((r) => r[0]!));

  const tenantId = account.id;

  // 4. Roles
  const roleData = [
    {
      tenant_id:   tenantId,
      name:        "CIO",
      description: "Chief Information Officer — full access",
      permissions: { level: "admin", connectors: "all", actions: "all" },
    },
    {
      tenant_id:   tenantId,
      name:        "D&A Manager",
      description: "Data & Analytics Manager",
      permissions: { level: "power", connectors: ["jira", "spirai"], actions: "standard" },
    },
    {
      tenant_id:   tenantId,
      name:        "IT Manager",
      description: "IT Operations Manager",
      permissions: { level: "standard", connectors: ["jira", "servicenow", "azure"], actions: "standard" },
    },
  ];

  const insertedRoles: Array<{ id: string; name: string; tenant_id: string }> = [];
  for (const r of roleData) {
    const [existing] = await db
      .select()
      .from(roles)
      .where(eq(roles.name, r.name))
      .limit(1);

    insertedRoles.push(existing ?? (await db.insert(roles).values(r).returning().then((res) => res[0]!)));
  }

  // 5. Admin user
  const adminEmail = "admin@dev.local";
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, adminEmail))
    .limit(1);

  const adminUser = existingUser ?? (await db
    .insert(users)
    .values({
      tenant_id:  tenantId,
      account_id: account.id,
      email:      adminEmail,
      user_type:  "admin",
      status:     "active",
    })
    .returning()
    .then((r) => r[0]!));

  // 6. Assign CIO role to admin
  const cioRole = insertedRoles.find((r) => r.name === "CIO")!;
  const [existingAssignment] = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.user_id, adminUser.id))
    .limit(1);

  if (!existingAssignment) {
    await db.insert(userRoles).values({
      user_id:     adminUser.id,
      role_id:     cioRole.id,
      assigned_by: adminUser.id,
    });
  }

  console.log("Seed complete.");
  console.log(`  Account ID (tenant_id): ${account.id}`);
  console.log(`  Account Application ID: ${accountApp.id}`);
  console.log(`  Admin user: ${adminEmail}`);
  console.log(`  Roles: ${insertedRoles.map((r) => r.name).join(", ")}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
