import { ApiProperty } from '@nestjs/swagger';
import {IsString} from 'class-validator';
import {Transform, Type} from "class-transformer";

export class AddTokenMetadataDto {
  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  userAddress: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  name: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  symbol: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  description: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  image: string;
}
