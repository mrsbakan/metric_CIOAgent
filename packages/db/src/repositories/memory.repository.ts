import { eq, and } from "drizzle-orm";
import type { Db } from "../client.js";
import { memoryPrivateUser, memoryPrivateRole } from "../schema/memory.js";

export type MemoryUserRow = typeof memoryPrivateUser.$inferSelect;
export type MemoryRoleRow = typeof memoryPrivateRole.$inferSelect;

export async function getAllUserMemory(
  db:     Db,
  userId: string,
): Promise<MemoryUserRow[]> {
  return db.select().from(memoryPrivateUser).where(eq(memoryPrivateUser.user_id, userId));
}

export async function upsertUserMemory(
  db: Db,
  params: { tenant_id: string; user_id: string; key: string; value: string },
): Promise<MemoryUserRow> {
  const [row] = await db
    .insert(memoryPrivateUser)
    .values({ ...params, updated_at: new Date() })
    .onConflictDoUpdate({
      target:  [memoryPrivateUser.tenant_id, memoryPrivateUser.user_id, memoryPrivateUser.key],
      set:     { value: params.value, updated_at: new Date() },
    })
    .returning();
  if (!row) throw new Error("upsertUserMemory: no row returned");
  return row;
}

export async function getAllRoleMemory(
  db:     Db,
  roleId: string,
): Promise<MemoryRoleRow[]> {
  return db.select().from(memoryPrivateRole).where(eq(memoryPrivateRole.role_id, roleId));
}

export async function upsertRoleMemory(
  db: Db,
  params: { tenant_id: string; role_id: string; key: string; value: string },
): Promise<MemoryRoleRow> {
  const [row] = await db
    .insert(memoryPrivateRole)
    .values({ ...params, updated_at: new Date() })
    .onConflictDoUpdate({
      target:  [memoryPrivateRole.tenant_id, memoryPrivateRole.role_id, memoryPrivateRole.key],
      set:     { value: params.value, updated_at: new Date() },
    })
    .returning();
  if (!row) throw new Error("upsertRoleMemory: no row returned");
  return row;
}
