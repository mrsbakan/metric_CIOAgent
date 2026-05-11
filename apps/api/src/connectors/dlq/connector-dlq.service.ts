import { Injectable, OnModuleDestroy, OnModuleInit, Inject } from "@nestjs/common";
import { and, eq, lt } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@cio-agent/db/client";
import { connectorEvents } from "@cio-agent/db/schema";
import { RedisKey, RedisTTL } from "@cio-agent/redis/keys";
import { publishEvent } from "@cio-agent/redis/streams";
import { withRls } from "../../common/db/with-rls.js";

const MAX_RETRIES = 3;
const POLL_INTERVAL_MS = 60 * 1000;
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

type ConnectorEvent = typeof connectorEvents.$inferSelect;

@Injectable()
export class ConnectorDlqService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject("DB")    private readonly db: Db,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.process(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async process(): Promise<void> {
    const members = await this.redis.smembers(RedisKey.activeConnectors("jira"));
    await Promise.allSettled(members.map((m) => this.processMember(m)));
  }

  async processMember(member: string): Promise<void> {
    const [tenantId, connectorId] = member.split(":");
    if (!tenantId || !connectorId) return;

    const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);

    const stuckEvents = await withRls(this.db, tenantId, async (tx) => {
      return tx
        .select()
        .from(connectorEvents)
        .where(
          and(
            eq(connectorEvents.connector_id, connectorId),
            eq(connectorEvents.status, "pending"),
            lt(connectorEvents.received_at, cutoff),
          ),
        )
        .limit(50);
    });

    for (const event of stuckEvents) {
      await this.retryOrDlq(tenantId, event as ConnectorEvent);
    }
  }

  async retryOrDlq(tenantId: string, event: ConnectorEvent): Promise<void> {
    const guardKey = RedisKey.connectorRetryGuard(event.id);
    const guarded = await this.redis.exists(guardKey);
    if (guarded) return;

    const newRetryCount = event.retry_count + 1;

    if (newRetryCount >= MAX_RETRIES) {
      await withRls(this.db, tenantId, async (tx) => {
        await tx
          .update(connectorEvents)
          .set({ status: "dlq", retry_count: newRetryCount })
          .where(eq(connectorEvents.id, event.id));
      });

      await publishEvent(
        {
          tenantId,
          eventType:   "connector.dlq.alert",
          connectorId: event.connector_id,
          payload: {
            eventId:    event.id,
            eventType:  event.event_type,
            retryCount: newRetryCount,
          },
        },
        this.redis,
      );
    } else {
      await withRls(this.db, tenantId, async (tx) => {
        await tx
          .update(connectorEvents)
          .set({ retry_count: newRetryCount })
          .where(eq(connectorEvents.id, event.id));
      });

      await this.redis.setex(guardKey, RedisTTL.CONNECTOR_RETRY_GUARD, "1");

      await publishEvent(
        {
          tenantId,
          eventType:   event.event_type,
          connectorId: event.connector_id,
          payload: {
            ...(event.payload as Record<string, unknown>),
            _retry:   newRetryCount,
            _eventId: event.id,
          },
        },
        this.redis,
      );
    }
  }
}
