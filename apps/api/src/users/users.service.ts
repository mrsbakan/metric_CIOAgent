import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt, lt } from "drizzle-orm";
import { hashPassword } from "@cio-agent/auth/password";
import type { Db } from "@cio-agent/db/client";
import { users, userRoles } from "@cio-agent/db/schema";
import type { TenantContext, PaginatedResponse } from "@cio-agent/shared/types";
import { withRls } from "../common/db/with-rls.js";
import type { CreateUserDto } from "./dto/create-user.dto.js";
import type { UpdateUserDto } from "./dto/update-user.dto.js";
import type { UserQueryDto } from "./dto/user-query.dto.js";

export type UserResponse = Omit<typeof users.$inferSelect, "password_hash">;

@Injectable()
export class UsersService {
  constructor(@Inject("DB") private readonly db: Db) {}

  async list(
    ctx: TenantContext,
    query: UserQueryDto,
  ): Promise<PaginatedResponse<UserResponse>> {
    const limit  = query.limit ?? 20;
    const cursor = query.cursor;

    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const conditions = [eq(users.tenant_id, ctx.tenant_id)];
      if (query.status) conditions.push(eq(users.status, query.status));
      if (cursor)       conditions.push(gt(users.created_at, new Date(cursor)));

      const rows = await tx
        .select({
          id:         users.id,
          tenant_id:  users.tenant_id,
          account_id: users.account_id,
          email:      users.email,
          user_type:  users.user_type,
          status:     users.status,
          created_at: users.created_at,
        })
        .from(users)
        .where(and(...conditions))
        .limit(limit + 1);

      const has_more = rows.length > limit;
      const data = has_more ? rows.slice(0, limit) : rows;
      const last = data.at(-1);

      return {
        data,
        pagination: {
          cursor:   has_more && last ? last.created_at.toISOString() : null,
          has_more,
          total:    data.length,
        },
      };
    });
  }

  async findById(ctx: TenantContext, id: string): Promise<UserResponse> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const [user] = await tx
        .select({
          id:         users.id,
          tenant_id:  users.tenant_id,
          account_id: users.account_id,
          email:      users.email,
          user_type:  users.user_type,
          status:     users.status,
          created_at: users.created_at,
        })
        .from(users)
        .where(and(eq(users.id, id), eq(users.tenant_id, ctx.tenant_id)))
        .limit(1);

      if (!user) throw new NotFoundException("User not found");
      return user;
    });
  }

  async create(ctx: TenantContext, dto: CreateUserDto): Promise<UserResponse> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const existing = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, dto.email), eq(users.tenant_id, ctx.tenant_id)))
        .limit(1);

      if (existing.length > 0) throw new ConflictException("Email already in use");

      // Inherit account_id from creating user
      const [creator] = await tx
        .select({ account_id: users.account_id })
        .from(users)
        .where(eq(users.id, ctx.user_id))
        .limit(1);

      const password_hash = await hashPassword(dto.password);

      const [user] = await tx
        .insert(users)
        .values({
          tenant_id:     ctx.tenant_id,
          account_id:    creator?.account_id ?? ctx.tenant_id,
          email:         dto.email,
          password_hash,
          user_type:     dto.user_type ?? "standard",
          status:        "active",
        })
        .returning({
          id:         users.id,
          tenant_id:  users.tenant_id,
          account_id: users.account_id,
          email:      users.email,
          user_type:  users.user_type,
          status:     users.status,
          created_at: users.created_at,
        });

      if (dto.role_ids && dto.role_ids.length > 0) {
        await tx.insert(userRoles).values(
          dto.role_ids.map((role_id) => ({
            user_id:     user!.id,
            role_id,
            assigned_by: ctx.user_id,
          })),
        );
      }

      return user!;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (dto.email !== undefined)     patch.email     = dto.email;
      if (dto.user_type !== undefined) patch.user_type = dto.user_type;
      if (dto.status !== undefined)    patch.status    = dto.status;

      if (Object.keys(patch).length === 0) {
        return this.findById(ctx, id);
      }

      if (dto.email) {
        const conflict = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.email, dto.email),
              eq(users.tenant_id, ctx.tenant_id),
              lt(users.id, id),
            ),
          )
          .limit(1);
        if (conflict.length > 0) throw new ConflictException("Email already in use");
      }

      const [updated] = await tx
        .update(users)
        .set(patch)
        .where(and(eq(users.id, id), eq(users.tenant_id, ctx.tenant_id)))
        .returning({
          id:         users.id,
          tenant_id:  users.tenant_id,
          account_id: users.account_id,
          email:      users.email,
          user_type:  users.user_type,
          status:     users.status,
          created_at: users.created_at,
        });

      if (!updated) throw new NotFoundException("User not found");
      return updated;
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const [deleted] = await tx
        .update(users)
        .set({ status: "inactive" })
        .where(and(eq(users.id, id), eq(users.tenant_id, ctx.tenant_id)))
        .returning({ id: users.id });

      if (!deleted) throw new NotFoundException("User not found");
    });
  }

  async assignRoles(
    ctx: TenantContext,
    userId: string,
    roleIds: string[],
  ): Promise<void> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.user_id, userId));

      if (roleIds.length > 0) {
        await tx.insert(userRoles).values(
          roleIds.map((role_id) => ({
            user_id:     userId,
            role_id,
            assigned_by: ctx.user_id,
          })),
        );
      }
    });
  }
}
