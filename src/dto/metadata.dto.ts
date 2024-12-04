import { ApiProperty } from '@nestjs/swagger';
import {IsOptional, IsString, MaxLength} from 'class-validator';
import {Type} from "class-transformer";

const LinkMaxLength = 128

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
  @MaxLength(LinkMaxLength, { message: `Link must not exceed ${LinkMaxLength} characters` })
  @IsString()
  @IsOptional()
  twitterLink: string;

  @ApiProperty({ type: String, required: false })
  @Type(() => String)
  @MaxLength(LinkMaxLength, { message: `Link must not exceed ${LinkMaxLength} characters` })
  @IsString()
  @IsOptional()
  telegramLink: string;

  @ApiProperty({ type: String, required: false })
  @Type(() => String)
  @MaxLength(LinkMaxLength, { message: `Link must not exceed ${LinkMaxLength} characters` })
  @IsString()
  @IsOptional()
  websiteLink: string;
}
