import {ApiProperty} from "@nestjs/swagger";
import {Transform, Type} from "class-transformer";
import {IsOptional, IsString} from "class-validator";

export class GetTradesDto {
  @ApiProperty({ type: String, required: false })
  @Transform((address) => address ? address.value.trim().toLowerCase() : address)
  @Type(() => String)
  @IsString()
  @IsOptional()
  tokenAddress?: string;

  @ApiProperty({ type: Number, required: false, default: '100' })
  // @Transform((limit) => limit.value.toNumber())
  @Type(() => String)
  @IsString()
  @IsOptional()
  limit: number;

  @ApiProperty({ type: Number, required: false, default: '0' })
  // @Transform((offset) => offset.value.toNumber())
  @Type(() => String)
  @IsString()
  @IsOptional()
  offset: number;
}

export class GetCandlesDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address ? address.value.trim().toLowerCase() : address)
  @Type(() => String)
  @IsString()
  tokenAddress: string;
}
