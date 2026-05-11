import { and, eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { promptLayers } from "../schema/prompt-skill.js";

export type PromptLayerRow = typeof promptLayers.$inferSelect;

export async function getActiveGeneralLayer(db: Db, tenantId: string): Promise<PromptLayerRow | undefined> {
  const rows = await db
    .select()
    .from(promptLayers)
    .where(
      and(
        eq(promptLayers.tenant_id, tenantId),
        eq(promptLayers.layer_type, "general"),
        eq(promptLayers.is_active, true),
      ),
    )
    .limit(1);
  return rows[0];
}
