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
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { IsArray, IsUUID } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { UsersService } from "./users.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserQueryDto } from "./dto/user-query.dto.js";
import { GetTenantContext } from "../common/decorators/tenant-context.decorator.js";
import type { TenantContext, PaginatedResponse } from "@cio-agent/shared/types";
import type { UserResponse } from "./users.service.js";

class AssignRolesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID(undefined, { each: true })
  role_ids!: string[];
}

@ApiTags("users")
@ApiBearerAuth()
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "List users (paginated)" })
  list(
    @GetTenantContext() ctx: TenantContext,
    @Query() query: UserQueryDto,
  ): Promise<PaginatedResponse<UserResponse>> {
    return this.usersService.list(ctx, query);
  }

  @Get(":id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Get user by ID" })
  findOne(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<UserResponse> {
    return this.usersService.findById(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: "Create user" })
  create(
    @GetTenantContext() ctx: TenantContext,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.create(ctx, dto);
  }

  @Patch(":id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Update user" })
  update(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.update(ctx, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Soft-delete user (status → inactive)" })
  remove(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.usersService.remove(ctx, id);
  }

  @Put(":id/roles")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Replace user role assignments" })
  assignRoles(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignRolesDto,
  ): Promise<void> {
    return this.usersService.assignRoles(ctx, id, dto.role_ids);
  }
}
