import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Db } from "@cio-agent/db/client";
import { roles, userRoles } from "@cio-agent/db/schema";
import type { TenantContext } from "@cio-agent/shared/types";
import { withRls } from "../common/db/with-rls.js";
import type { CreateRoleDto } from "./dto/create-role.dto.js";
import type { UpdateRoleDto } from "./dto/update-role.dto.js";

export type RoleRow = typeof roles.$inferSelect;

@Injectable()
export class RolesService {
  constructor(@Inject("DB") private readonly db: Db) {}

  async list(ctx: TenantContext): Promise<RoleRow[]> {
    return withRls(this.db, ctx.tenant_id, async (tx) =>
      tx.select().from(roles).where(eq(roles.tenant_id, ctx.tenant_id)),
    );
  }

  async findById(ctx: TenantContext, id: string): Promise<RoleRow> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const [role] = await tx
        .select()
        .from(roles)
        .where(and(eq(roles.id, id), eq(roles.tenant_id, ctx.tenant_id)))
        .limit(1);

      if (!role) throw new NotFoundException("Role not found");
      return role;
    });
  }

  async create(ctx: TenantContext, dto: CreateRoleDto): Promise<RoleRow> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const conflict = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.name, dto.name), eq(roles.tenant_id, ctx.tenant_id)))
        .limit(1);

      if (conflict.length > 0) throw new ConflictException("Role name already exists");

      const [role] = await tx
        .insert(roles)
        .values({
          tenant_id:         ctx.tenant_id,
          name:              dto.name,
          description:       dto.description ?? null,
          permissions:       dto.permissions ?? {},
          escalation_config: dto.escalation_config ?? {},
          alert_thresholds:  dto.alert_thresholds ?? {},
        })
        .returning();

      return role!;
    });
  }

  async update(
    ctx: TenantContext,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<RoleRow> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      const patch: Partial<typeof roles.$inferInsert> = {};
      if (dto.name !== undefined)              patch.name              = dto.name;
      if (dto.description !== undefined)       patch.description       = dto.description;
      if (dto.permissions !== undefined)       patch.permissions       = dto.permissions;
      if (dto.escalation_config !== undefined) patch.escalation_config = dto.escalation_config;
      if (dto.alert_thresholds !== undefined)  patch.alert_thresholds  = dto.alert_thresholds;

      if (Object.keys(patch).length === 0) return this.findById(ctx, id);

      if (dto.name) {
        const conflict = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(and(eq(roles.name, dto.name), eq(roles.tenant_id, ctx.tenant_id)))
          .limit(1);
        if (conflict.some((r) => r.id !== id)) {
          throw new ConflictException("Role name already exists");
        }
      }

      const [updated] = await tx
        .update(roles)
        .set(patch)
        .where(and(eq(roles.id, id), eq(roles.tenant_id, ctx.tenant_id)))
        .returning();

      if (!updated) throw new NotFoundException("Role not found");
      return updated;
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    return withRls(this.db, ctx.tenant_id, async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.role_id, id));

      const [deleted] = await tx
        .delete(roles)
        .where(and(eq(roles.id, id), eq(roles.tenant_id, ctx.tenant_id)))
        .returning({ id: roles.id });

      if (!deleted) throw new NotFoundException("Role not found");
    });
  }
}
