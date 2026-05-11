import { Module } from "@nestjs/common";
import { db, getRedisClient } from "./auth.providers.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: "DB",    useValue: db },
    { provide: "REDIS", useFactory: () => getRedisClient() },
  ],
})
export class AuthModule {}
