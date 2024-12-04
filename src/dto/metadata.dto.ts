import { ApiProperty } from '@nestjs/swagger';
import {IsOptional, IsString} from 'class-validator';
import {Type} from "class-transformer";

export class AddTokenMetadataDto {
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

  @ApiProperty({ type: String, required: false })
  @Type(() => String)
  @IsString()
  @IsOptional()
  twitterLink: string;

  @ApiProperty({ type: String, required: false })
  @Type(() => String)
  @IsString()
  @IsOptional()
  telegramLink: string;

  @ApiProperty({ type: String, required: false })
  @Type(() => String)
  @IsString()
  @IsOptional()
  websiteLink: string;
}
