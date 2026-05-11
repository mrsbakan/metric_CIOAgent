import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CreditService } from "@cio-agent/credits";
import { AuditService } from "@cio-agent/audit";
import { CreditInterceptor } from "../common/interceptors/credit.interceptor.js";
import { db, auditDb } from "@cio-agent/db";
import { getRedisClient } from "@cio-agent/redis/client";

@Module({
  providers: [
    Reflector,
    { provide: "CREDIT_SERVICE", useFactory: () => new CreditService(db, getRedisClient()) },
    { provide: "AUDIT_SERVICE",  useFactory: () => new AuditService(auditDb) },
    CreditInterceptor,
  ],
  exports: ["CREDIT_SERVICE", "AUDIT_SERVICE", CreditInterceptor],
})
export class CreditsModule {}
