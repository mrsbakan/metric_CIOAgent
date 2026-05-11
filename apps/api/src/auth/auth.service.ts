import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { eq, and } from "drizzle-orm";
import { verifyPassword } from "@cio-agent/auth/password";
import { signTokenPair, verifyRefreshToken, decodeTokenUnsafe } from "@cio-agent/auth/jwt";
import type { TokenPair } from "@cio-agent/auth/types";
import type { RedisClient } from "@cio-agent/redis/client";
import { RedisKey, RedisTTL } from "@cio-agent/redis/keys";
import type { Db } from "@cio-agent/db/client";
import { users, userRoles, accountApplications } from "@cio-agent/db/schema";
import type { LoginDto } from "./dto/login.dto.js";
import type { RefreshDto } from "./dto/refresh.dto.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject("DB")    private readonly db: Db,
    @Inject("REDIS") private readonly redis: RedisClient,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, dto.email),
          eq(users.tenant_id, dto.tenant_id),
        ),
      )
      .limit(1);

    // Constant-time rejection — prevents user enumeration
    if (!user || user.status !== "active") {
      await verifyPassword("__dummy__", "$2b$12$invalidhashpadding000000000000000000000000000000000000000");
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await verifyPassword(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException("Invalid credentials");

    const [primaryRole] = await this.db
      .select({ role_id: userRoles.role_id })
      .from(userRoles)
      .where(eq(userRoles.user_id, user.id))
      .limit(1);

    const [accountApp] = await this.db
      .select({ id: accountApplications.id })
      .from(accountApplications)
      .where(
        and(
          eq(accountApplications.account_id, user.account_id),
          eq(accountApplications.status, "active"),
        ),
      )
      .limit(1);

    const role_id = primaryRole?.role_id ?? "";
    const account_application_id = accountApp?.id ?? "";

    const pair = await signTokenPair({
      sub:       user.id,
      tenant_id: user.tenant_id,
      role_id,
      user_type: user.user_type,
      account_application_id,
    });

    const refreshPayload = await decodeTokenUnsafe(pair.refresh_token);
    if (refreshPayload?.jti) {
      await this.redis.setex(
        RedisKey.refreshToken(refreshPayload.jti),
        RedisTTL.REFRESH_TOKEN,
        JSON.stringify({ user_id: user.id, tenant_id: user.tenant_id }),
      );
    }

    return pair;
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    let payload;
    try {
      payload = await verifyRefreshToken(dto.refresh_token);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const stored = await this.redis.get(RedisKey.refreshToken(payload.jti));
    if (!stored) throw new UnauthorizedException("Refresh token revoked or expired");

    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, payload.sub),
          eq(users.tenant_id, payload.tenant_id),
        ),
      )
      .limit(1);

    if (!user || user.status !== "active") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const [primaryRole] = await this.db
      .select({ role_id: userRoles.role_id })
      .from(userRoles)
      .where(eq(userRoles.user_id, user.id))
      .limit(1);

    const [accountApp] = await this.db
      .select({ id: accountApplications.id })
      .from(accountApplications)
      .where(
        and(
          eq(accountApplications.account_id, user.account_id),
          eq(accountApplications.status, "active"),
        ),
      )
      .limit(1);

    // Revoke old refresh token before issuing new pair (rotation)
    await this.redis.del(RedisKey.refreshToken(payload.jti));

    const pair = await signTokenPair({
      sub:                    user.id,
      tenant_id:              user.tenant_id,
      role_id:                primaryRole?.role_id ?? "",
      user_type:              user.user_type,
      account_application_id: accountApp?.id ?? "",
    });

    const newRefreshPayload = await decodeTokenUnsafe(pair.refresh_token);
    if (newRefreshPayload?.jti) {
      await this.redis.setex(
        RedisKey.refreshToken(newRefreshPayload.jti),
        RedisTTL.REFRESH_TOKEN,
        JSON.stringify({ user_id: user.id, tenant_id: user.tenant_id }),
      );
    }

    return pair;
  }

  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    const payload = await decodeTokenUnsafe(accessToken);

    if (payload?.jti && payload.exp) {
      const remainingTtl = payload.exp - Math.floor(Date.now() / 1000);
      if (remainingTtl > 0) {
        await this.redis.setex(
          RedisKey.tokenBlacklist(payload.jti),
          remainingTtl,
          "1",
        );
      }
    }

    if (refreshToken) {
      try {
        const rp = await verifyRefreshToken(refreshToken);
        await this.redis.del(RedisKey.refreshToken(rp.jti));
      } catch {
        // Best-effort — don't fail logout if refresh token is already invalid
      }
    }
  }
}
