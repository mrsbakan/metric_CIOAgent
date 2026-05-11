import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@cio-agent/db/client";
import { connectors } from "@cio-agent/db/schema";
import { RedisKey } from "@cio-agent/redis/keys";
import { publishEvent } from "@cio-agent/redis/streams";
import { getConnectorSecret } from "@cio-agent/vault/secrets";
import { JiraConnector } from "@cio-agent/connector-jira/connector";
import { withRls } from "../../common/db/with-rls.js";

type ConnectorRow = typeof connectors.$inferSelect;

const POLL_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class ConnectorPollingService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject("DB")    private readonly db: Db,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<void> {
    const members = await this.redis.smembers(RedisKey.activeConnectors("jira"));

    await Promise.allSettled(
      members.map((member) => this.pollMember(member)),
    );
  }

  private async pollMember(member: string): Promise<void> {
    const [tenantId, connectorId] = member.split(":");
    if (!tenantId || !connectorId) return;

    const row = await withRls(this.db, tenantId, async (tx) => {
      const [r] = await tx
        .select()
        .from(connectors)
        .where(
          and(
            eq(connectors.id, connectorId),
            eq(connectors.tenant_id, tenantId),
            eq(connectors.is_active, true),
          ),
        )
        .limit(1);
      return r ?? null;
    });

    if (!row) return;

    await this.pollConnector(row);
  }

  async pollConnector(row: ConnectorRow): Promise<void> {
    const secret = await getConnectorSecret(row.tenant_id, "jira");

    const connector = new JiraConnector(
      {
        id:            row.id,
        tenantId:      row.tenant_id,
        type:          row.type,
        name:          row.name,
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

    const result = await connector.read({
      resourceType: "issue",
      query:        "ORDER BY updated DESC",
      limit:        50,
    });

    await publishEvent(
      {
        tenantId:    row.tenant_id,
        eventType:   "jira.poll",
        connectorId: row.id,
        payload:     { issues: result.data, total: result.total ?? result.data.length },
      },
      this.redis,
    );
  }
}
