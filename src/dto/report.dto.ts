import { ApiProperty } from '@nestjs/swagger';
import {IsNumber, IsOptional, IsString, Max} from 'class-validator';
import {Transform, Type} from "class-transformer";

export class AddReportDto {
  @ApiProperty({ type: Number, required: true })
  @Type(() => Number)
  @IsNumber()
  type: number;

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

  @ApiProperty({ type: String, required: false })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  @IsOptional()
  reporterUserAddress?: string;
}

export class GetReportsDto {
  @ApiProperty({ type: Number, required: false })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  type?: number;

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

  @ApiProperty({ type: String, required: false })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  @IsOptional()
  reporterUserAddress?: string;

  @ApiProperty({ type: Number, required: false, default: 100 })
  @Type(() => Number)
  @IsNumber()
  @Max(1000)
  @IsOptional()
  limit?: number;

  @ApiProperty({ type: Number, required: false, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  offset?: number;
}
