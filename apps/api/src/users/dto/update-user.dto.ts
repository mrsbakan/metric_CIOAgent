import { IsEmail, IsEnum, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ["admin", "power", "standard", "readonly"] })
  @IsOptional()
  @IsEnum(["admin", "power", "standard", "readonly"])
  user_type?: "admin" | "power" | "standard" | "readonly";

  @ApiPropertyOptional({ enum: ["active", "inactive", "pending"] })
  @IsOptional()
  @IsEnum(["active", "inactive", "pending"])
  status?: "active" | "inactive" | "pending";
}
