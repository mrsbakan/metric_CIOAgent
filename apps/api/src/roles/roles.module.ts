import { Module } from "@nestjs/common";
import { db } from "@cio-agent/db/client";
import { RolesService } from "./roles.service.js";
import { RolesController } from "./roles.controller.js";

@Module({
  controllers: [RolesController],
  providers: [
    RolesService,
    { provide: "DB", useValue: db },
  ],
  exports: [RolesService],
})
export class RolesModule {}
