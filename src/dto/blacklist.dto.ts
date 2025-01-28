import {ApiProperty} from "@nestjs/swagger";
import {Transform, Type} from "class-transformer";
import {IsBoolean, IsOptional, IsString} from "class-validator";

export class BlacklistDto {
  @ApiProperty({ type: String, required: false })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @ApiProperty({ type: String, required: false })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  @IsOptional()
  userAddress?: string;

  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  isEnabled: boolean;
}
