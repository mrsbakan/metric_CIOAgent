import type { Db } from "@cio-agent/db";
import { getActiveGeneralLayer as dbGetActiveGeneralLayer, withRls } from "@cio-agent/db";
import type { IPromptLayerRepository, PromptLayerRow } from "./types.js";

export class PromptLayerRepository implements IPromptLayerRepository {
  constructor(private readonly db: Db) {}

  async getActiveGeneralLayer(tenantId: string): Promise<PromptLayerRow | undefined> {
    return withRls(this.db, tenantId, (tx) => dbGetActiveGeneralLayer(tx, tenantId));
  }
}
