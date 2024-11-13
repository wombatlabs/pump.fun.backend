import { ApiProperty } from '@nestjs/swagger';
import {IsString} from 'class-validator';
import {Transform, Type} from "class-transformer";

export class SignInRequestDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  address: string;
}

export class VerifySignatureDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  address: string;

  @ApiProperty({ type: String, required: true })
  @Type(() => String)
  @IsString()
  signature: string;
}
