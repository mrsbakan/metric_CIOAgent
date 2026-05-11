import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import type { TenantContext } from "@cio-agent/shared/types";
import type { ConnectorHealth } from "@cio-agent/connector-framework/types";
import { GetTenantContext } from "../common/decorators/tenant-context.decorator.js";
import { ConnectorsService, type ConnectorRow } from "./connectors.service.js";
import { CreateConnectorDto } from "./dto/create-connector.dto.js";

@ApiTags("connectors")
@ApiBearerAuth()
@Controller({ path: "connectors", version: "1" })
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Get()
  @ApiOperation({ summary: "List connectors for tenant" })
  list(@GetTenantContext() ctx: TenantContext): Promise<ConnectorRow[]> {
    return this.connectorsService.list(ctx);
  }

  @Get(":id")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Get connector by ID" })
  findOne(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ConnectorRow> {
    return this.connectorsService.findById(ctx, id);
  }

  @Post()
  @ApiOperation({ summary: "Register a connector (credentials must be pre-loaded in Vault)" })
  create(
    @GetTenantContext() ctx: TenantContext,
    @Body() dto: CreateConnectorDto,
  ): Promise<ConnectorRow> {
    return this.connectorsService.create(ctx, dto);
  }

  @Get(":id/health")
  @ApiParam({ name: "id", type: String })
  @ApiOperation({ summary: "Health check for a connector" })
  health(
    @GetTenantContext() ctx: TenantContext,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ConnectorHealth> {
    return this.connectorsService.healthCheck(ctx, id);
  }
}
