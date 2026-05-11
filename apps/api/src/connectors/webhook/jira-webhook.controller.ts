import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import type { Db } from "@cio-agent/db/client";
import { connectorEvents } from "@cio-agent/db/schema";
import { publishEvent } from "@cio-agent/redis/streams";
import { Public } from "../../common/decorators/public.decorator.js";
import { withRls } from "../../common/db/with-rls.js";
import { WebhookSignatureGuard } from "./webhook-signature.guard.js";

@ApiTags("connectors")
@Controller({ path: "connectors/jira/webhook", version: "1" })
export class JiraWebhookController {
  constructor(
    @Inject("DB")    private readonly db: Db,
    @Inject("REDIS") private readonly redis: Redis,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(WebhookSignatureGuard)
  @ApiOperation({ summary: "Receive JIRA webhook event (HMAC-secured)" })
  async handleWebhook(
    @Query("tenant_id")    tenantId: string,
    @Query("connector_id") connectorId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    const eventType = typeof body["webhookEvent"] === "string" ? body["webhookEvent"] : "jira.unknown";

    await withRls(this.db, tenantId, async (tx) => {
      await tx.insert(connectorEvents).values({
        tenant_id:    tenantId,
        connector_id: connectorId,
        event_type:   eventType,
        payload:      body,
        status:       "pending",
      });
    });

    await publishEvent(
      { tenantId, eventType, connectorId, payload: body },
      this.redis,
    );

    return { received: true };
  }
}
