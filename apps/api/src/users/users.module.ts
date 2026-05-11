import { Module } from "@nestjs/common";
import { db } from "@cio-agent/db/client";
import { UsersService } from "./users.service.js";
import { UsersController } from "./users.controller.js";

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: "DB", useValue: db },
  ],
  exports: [UsersService],
})
export class UsersModule {}
