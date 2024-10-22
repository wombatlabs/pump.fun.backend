import { ApiProperty } from '@nestjs/swagger';
import {IsString} from 'class-validator';
import {Transform, Type} from "class-transformer";

export class GetTokensDto {
  @ApiProperty({ type: Number, required: false, default: '100' })
  // @Transform((limit) => limit.value.toNumber())
  @Type(() => String)
  @IsString()
  limit: number;

  @ApiProperty({ type: Number, required: false, default: '0' })
  // @Transform((offset) => offset.value.toNumber())
  @Type(() => String)
  @IsString()
  offset: number;
}
