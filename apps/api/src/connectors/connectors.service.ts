import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@cio-agent/db/client";
import { connectors } from "@cio-agent/db/schema";
import type { TenantContext } from "@cio-agent/shared/types";
import { RedisKey } from "@cio-agent/redis/keys";
import { getConnectorSecret } from "@cio-agent/vault/secrets";
import { VaultPath } from "@cio-agent/vault/paths";
import { JiraConnector } from "@cio-agent/connector-jira/connector";
import type { ConnectorHealth } from "@cio-agent/connector-framework/types";
import { withRls } from "../common/db/with-rls.js";
import type { CreateConnectorDto } from "./dto/create-connector.dto.js";

export type ConnectorRow = typeof connectors.$inferSelect;

@Injectable()
export class ConnectorsService {
  constructor(
    @Inject("DB") private readonly db: Db,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  async list(ctx: TenantContext): Promise<ConnectorRow[]> {
    return withRls(this.db, ctx.tenant_id, async (tx) =>
      tx.select().from(connectors).where(eq(connectors.tenant_id, ctx.tenant_id)),
    );
  }

  async findById(ctx: TenantContext, id: string): Promise<ConnectorRow> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const [row] = await tx
        .select()
        .from(connectors)
        .where(and(eq(connectors.id, id), eq(connectors.tenant_id, ctx.tenant_id)))
        .limit(1);
      if (!row) throw new NotFoundException("Connector not found");
      return row;
    });
  }

  async create(ctx: TenantContext, dto: CreateConnectorDto): Promise<ConnectorRow> {
    const row = await withRls(this.db, ctx.tenant_id, async (tx) => {
      const vaultPath = VaultPath.tenant.connector(ctx.tenant_id, dto.type);

      const [inserted] = await tx
        .insert(connectors)
        .values({
          tenant_id:      ctx.tenant_id,
          type:           dto.type,
          name:           dto.name,
          auth_config:    vaultPath,
          field_mapping:  dto.fieldMapping  ?? {},
          webhook_config: dto.webhookConfig ?? {},
          is_active:      true,
        })
        .returning();

      return inserted!;
    });

    await this.redis.sadd(
      RedisKey.activeConnectors(dto.type),
      `${ctx.tenant_id}:${row.id}`,
    );

    return row;
  }

  async healthCheck(ctx: TenantContext, id: string): Promise<ConnectorHealth> {
    const connector = await this.getConnectorInstance(ctx, id);
    return connector.healthCheck();
  }

  async getConnectorInstance(ctx: TenantContext, id: string): Promise<JiraConnector> {
    const row = await this.findById(ctx, id);
    const secret = await getConnectorSecret(ctx.tenant_id, row.type);

    return new JiraConnector(
      {
        id:             row.id,
        tenantId:       row.tenant_id,
        type:           row.type,
        name:           row.name,
        authConfig: {
          host:     secret.instance_url ?? "",
          email:    secret.username     ?? "",
          apiToken: secret.api_token    ?? "",
        },
        fieldMapping:  row.field_mapping  as Record<string, unknown>,
        webhookConfig: row.webhook_config as Record<string, unknown>,
      },
      this.redis,
    );
  }
}
