import {ApiProperty} from "@nestjs/swagger";
import {Type} from "class-transformer";
import {IsOptional, IsString} from "class-validator";

export class GetCompetitionsDto {
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  competitionId?: number;

  @ApiProperty({ type: Number, required: false, default: '100' })
  // @Transform((limit) => limit.value.toNumber())
  @Type(() => String)
  @IsString()
  @IsOptional()
  limit?: number;

  @ApiProperty({ type: Number, required: false, default: '0' })
  // @Transform((offset) => offset.value.toNumber())
  @Type(() => String)
  @IsString()
  @IsOptional()
  offset?: number;
}
