import { sql } from "drizzle-orm";
import type { Db } from "./client.js";

export async function withRls<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
    return fn(tx as unknown as Db);
  });
}
