import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { ConnectorType } from "@cio-agent/shared/types";

export class CreateConnectorDto {
  @ApiProperty({ enum: ["jira", "servicenow", "azure", "spirai"] })
  @IsEnum(["jira", "servicenow", "azure", "spirai"])
  type!: ConnectorType;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  fieldMapping?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  webhookConfig?: Record<string, unknown>;
}
