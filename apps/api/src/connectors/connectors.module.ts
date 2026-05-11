import { Module } from "@nestjs/common";
import { db } from "@cio-agent/db/client";
import { getRedisClient } from "@cio-agent/redis/client";
import { ConnectorsService } from "./connectors.service.js";
import { ConnectorsController } from "./connectors.controller.js";
import { JiraWebhookController } from "./webhook/jira-webhook.controller.js";
import { WebhookSignatureGuard } from "./webhook/webhook-signature.guard.js";
import { ConnectorPollingService } from "./polling/connector-polling.service.js";
import { ConnectorDlqService } from "./dlq/connector-dlq.service.js";

@Module({
  controllers: [ConnectorsController, JiraWebhookController],
  providers: [
    ConnectorsService,
    ConnectorPollingService,
    ConnectorDlqService,
    WebhookSignatureGuard,
    { provide: "DB",    useValue: db },
    { provide: "REDIS", useFactory: () => getRedisClient() },
  ],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
