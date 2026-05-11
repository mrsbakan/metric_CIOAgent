import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { verifyAccessToken } from "@cio-agent/auth/jwt";
import type { TenantContext } from "@cio-agent/shared/types";
import type { RedisClient } from "@cio-agent/redis/client";
import { RedisKey } from "@cio-agent/redis/keys";
import { requestStorage } from "../request-context.js";

export const IS_PUBLIC_KEY = "isPublic";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject("REDIS") private readonly redis: RedisClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token   = this.extractBearer(request);

    if (!token) {
      throw new UnauthorizedException("Missing authorization token");
    }

    try {
      const payload = await verifyAccessToken(token);

      const blacklisted = await this.redis.exists(RedisKey.tokenBlacklist(payload.jti));
      if (blacklisted) {
        throw new UnauthorizedException("Token has been revoked");
      }

      const tenantCtx: TenantContext = {
        user_id:                payload.sub,
        tenant_id:              payload.tenant_id,
        role_id:                payload.role_id,
        user_type:              payload.user_type,
        account_application_id: payload.account_application_id,
      };

      // Attach to request for use in controllers
      (request as Request & { tenantContext: TenantContext }).tenantContext = tenantCtx;

      // Update AsyncLocalStorage so middleware-level context is also populated
      const store = requestStorage.getStore();
      if (store) store.tenant_context = tenantCtx;

      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  private extractBearer(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return null;
    return auth.slice(7);
  }
}
