import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { RolesService } from "./roles.service.js";
import { CreateRoleDto } from "./dto/create-role.dto.js";
import { UpdateRoleDto } from "./dto/update-role.dto.js";
import { GetTenantContext } from "../common/decorators/tenant-context.decorator.js";
import type { TenantContext } from "@cio-agent/shared/types";
import type { RoleRow } from "./roles.service.js";

@ApiTags("roles")
@ApiBearerAuth()
@Controller({ path: "roles", version: "1" })
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @ApiOperation({ summary: "List all roles" })
  list(@GetTenantContext() ctx: TenantContext): Promise<RoleRow[]> {
    return this.rolesService.list(ctx);
  }

  @Get(":id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Get role by ID" })
  findOne(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<RoleRow> {
    return this.rolesService.findById(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: "Create role" })
  create(
    @GetTenantContext() ctx: TenantContext,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleRow> {
    return this.rolesService.create(ctx, dto);
  }

  @Patch(":id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Update role" })
  update(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleRow> {
    return this.rolesService.update(ctx, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Delete role (cascades user_roles)" })
  remove(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.rolesService.remove(ctx, id);
  }
}
