import { Module } from "@nestjs/common";
import { ChatGateway } from "./chat.gateway.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

@Module({
  imports:   [NotificationsModule],
  providers: [ChatGateway],
})
export class ChatModule {}
