import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { TenantContext } from "@cio-agent/shared/types";

export const GetTenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const request = ctx.switchToHttp().getRequest<
      Request & { tenantContext: TenantContext }
    >();
    return request.tenantContext;
  },
);
