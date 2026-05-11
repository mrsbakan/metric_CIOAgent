import { IsEmail, IsString, IsUUID, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@acme.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "S3cur3P@ss!" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: "550e8400-e29b-41d4-a716-446655440000" })
  @IsUUID()
  tenant_id!: string;
}
