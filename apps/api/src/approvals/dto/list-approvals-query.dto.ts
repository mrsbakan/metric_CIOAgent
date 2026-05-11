import { IsIn, IsOptional } from "class-validator";
import type { ApprovalStatus } from "@cio-agent/shared/types";

export class ListApprovalsQueryDto {
  @IsOptional()
  @IsIn(["pending", "approved", "rejected"])
  status?: ApprovalStatus;
}
