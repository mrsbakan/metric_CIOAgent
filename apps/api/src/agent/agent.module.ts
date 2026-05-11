import { Module, DynamicModule } from "@nestjs/common";
import type { Redis } from "ioredis";
import { AgentRunner } from "@cio-agent/agent-core";
import { SessionRepository } from "@cio-agent/agent-core";
import { MemoryService, parseEncryptionKey } from "@cio-agent/agent-core";
import { PromptCompiler, PromptLayerRepository } from "@cio-agent/prompt-compiler";
import type { AuditService } from "@cio-agent/audit";
import type { Db } from "@cio-agent/db/client";
import { acquireLock } from "@cio-agent/redis/lock";
import { RedisTTL } from "@cio-agent/redis/keys";
import type { AgentDeps } from "@cio-agent/agent-core";

@Module({})
export class AgentModule {
  static forRoot(): DynamicModule {
    return {
      module: AgentModule,
      global: true,
      providers: [
        {
          provide: "AGENT_RUNNER",
          useFactory: (db: Db, redis: Redis, auditService: AuditService): AgentRunner => {
            const sessionRepo    = new SessionRepository(db);
            const repo           = new PromptLayerRepository(db);
            const promptCompiler = new PromptCompiler(repo);

            const rawKey = process.env["MEMORY_ENC_KEY"];
            if (!rawKey) throw new Error("MEMORY_ENC_KEY env var is required");
            const encKey      = parseEncryptionKey(rawKey);
            const memoryService = new MemoryService(db, encKey);

            const acquireApprovalLock = (sessionId: string) =>
              acquireLock(sessionId, RedisTTL.APPROVAL_MUTEX, redis);

            const deps: AgentDeps = {
              sessionRepo,
              auditService,
              promptCompiler,
              memoryService,
              acquireApprovalLock,
            };

            return new AgentRunner(deps);
          },
          inject: ["DB", "REDIS", "AUDIT_SERVICE"],
        },
      ],
      exports: ["AGENT_RUNNER"],
    };
  }
}
