import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApprovalsService } from "./approvals.service.js";
import { GetTenantContext } from "../common/decorators/tenant-context.decorator.js";
import type { TenantContext } from "@cio-agent/shared/types";
import { ListApprovalsQueryDto } from "./dto/list-approvals-query.dto.js";
import { ResolveApprovalDto } from "./dto/resolve-approval.dto.js";

@ApiTags("approvals")
@Controller({ path: "approvals", version: "1" })
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @ApiOperation({ summary: "List approvals (filter by status)" })
  list(
    @GetTenantContext() ctx: TenantContext,
    @Query() query: ListApprovalsQueryDto,
  ) {
    return this.approvalsService.list(ctx, query);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve a pending action — resumes the agent" })
  approve(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.approvalsService.approve(ctx, id);
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Reject a pending action" })
  async reject(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.approvalsService.reject(ctx, id);
  }
}
