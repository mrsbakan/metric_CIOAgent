import { Inject, Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Db } from "@cio-agent/db/client";
import { pendingApprovals } from "@cio-agent/db/schema";
import {
  getApprovalsByTenant,
  resolveApprovalInDb,
  type ApprovalRow,
} from "@cio-agent/db";
import { withRls } from "../common/db/with-rls.js";
import { AgentRunner, type AgentRunResult } from "@cio-agent/agent-core";
import type { TenantContext } from "@cio-agent/shared/types";
import type { ListApprovalsQueryDto } from "./dto/list-approvals-query.dto.js";

@Injectable()
export class ApprovalsService {
  constructor(
    @Inject("DB")            private readonly db:     Db,
    @Inject("AGENT_RUNNER")  private readonly runner: AgentRunner,
  ) {}

  async list(ctx: TenantContext, query: ListApprovalsQueryDto): Promise<ApprovalRow[]> {
    return withRls(this.db, ctx.tenant_id, (tx) =>
      getApprovalsByTenant(tx, ctx.tenant_id, query.status),
    );
  }

  async approve(ctx: TenantContext, approvalId: string): Promise<AgentRunResult> {
    const approval = await this.fetchAndVerify(ctx, approvalId);

    await withRls(this.db, ctx.tenant_id, (tx) =>
      resolveApprovalInDb(tx, approvalId, {
        status:     "approved",
        resolvedBy: ctx.user_id,
        resolvedAt: new Date(),
      }),
    );

    return this.runner.resume({
      tenantId:             ctx.tenant_id,
      userId:               ctx.user_id,
      roleId:               ctx.role_id,
      accountApplicationId: ctx.account_application_id,
      userType:             ctx.user_type,
      sessionId:            approval.session_id,
      approvalId,
    });
  }

  async reject(ctx: TenantContext, approvalId: string): Promise<void> {
    await this.fetchAndVerify(ctx, approvalId);

    await withRls(this.db, ctx.tenant_id, (tx) =>
      resolveApprovalInDb(tx, approvalId, {
        status:     "rejected",
        resolvedBy: ctx.user_id,
        resolvedAt: new Date(),
      }),
    );
  }

  private async fetchAndVerify(ctx: TenantContext, approvalId: string): Promise<ApprovalRow> {
    const [row] = await withRls(this.db, ctx.tenant_id, (tx) =>
      tx
        .select()
        .from(pendingApprovals)
        .where(
          and(
            eq(pendingApprovals.id, approvalId),
            eq(pendingApprovals.tenant_id, ctx.tenant_id),
          ),
        )
        .limit(1),
    );

    if (!row) throw new NotFoundException("Approval not found");
    if (row.status !== "pending") {
      throw new ForbiddenException(`Approval is already ${row.status}`);
    }
    return row;
  }
}
