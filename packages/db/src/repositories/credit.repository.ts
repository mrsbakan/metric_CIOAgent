import { eq, and, sql } from "drizzle-orm";
import type { Db } from "../client.js";
import { creditLedger } from "../schema/credits-licensing.js";

export async function getCreditBalance(
  db: Db,
  tenantId: string,
  accountApplicationId: string,
): Promise<number> {
  const result = await db
    .select({
      balance: sql<number>`COALESCE(SUM(CASE WHEN ${creditLedger.type} = 'credit' THEN ${creditLedger.amount} ELSE -${creditLedger.amount} END), 0)::integer`,
    })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.tenant_id, tenantId),
        eq(creditLedger.account_application_id, accountApplicationId),
      ),
    );

  return result[0]?.["balance"] ?? 0;
}
