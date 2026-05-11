import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, Reflector } from "@nestjs/core";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter.js";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { RequestContextMiddleware } from "./common/middleware/request-context.middleware.js";
import { AuthModule } from "./auth/auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { RolesModule } from "./roles/roles.module.js";
import { CreditsModule } from "./credits/credits.module.js";
import { ConnectorsModule } from "./connectors/connectors.module.js";
import { AgentModule } from "./agent/agent.module.js";
import { ApprovalsModule } from "./approvals/approvals.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { db } from "@cio-agent/db";
import { getRedisClient } from "@cio-agent/redis/client";

@Module({
  imports: [
    AuthModule,
    UsersModule,
    RolesModule,
    CreditsModule,
    ConnectorsModule,
    AgentModule.forRoot(),
    ApprovalsModule,
    ChatModule,
  ],
  providers: [
    Reflector,
    { provide: "DB",    useValue: db },
    { provide: "REDIS", useFactory: () => getRedisClient() },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD,  useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
