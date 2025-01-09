import { ApiProperty } from '@nestjs/swagger';
import {IsString, MaxLength, MinLength} from 'class-validator';
import {Transform, Type} from "class-transformer";

const CommentMinLength = 2

export class AddCommentDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  tokenAddress: string;

  // @ApiProperty({ type: String, required: true })
  // @Transform((address) => address.value.trim().toLowerCase())
  // @Type(() => String)
  // @IsString()
  // userAddress: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @MinLength(CommentMinLength, { message: `comment must be at least ${CommentMinLength} characters` })
  @IsString()
  text: string;
}

export class GetCommentsDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  tokenAddress: string;

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
