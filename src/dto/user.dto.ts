import { ApiProperty } from '@nestjs/swagger';
import {IsString, MaxLength} from 'class-validator';
import {Transform, Type} from "class-transformer";

export class AddUserDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  address: string;
}

export class GetUsersDto {
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

const UsernameMaxLength = 20

export class UpdateUserDto {
  @ApiProperty({ type: String, required: true, default: '' })
  @Transform((address) => address.value.trim().toLowerCase())
  @MaxLength(UsernameMaxLength, { message: `username must not exceed ${UsernameMaxLength} characters` })
  @Type(() => String)
  @IsString()
  username: string;
}
