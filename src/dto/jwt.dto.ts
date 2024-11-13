import { ApiProperty } from '@nestjs/swagger';
import {IsNotEmpty, IsString} from "class-validator";

export class JwtTokenDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class JwtTokensDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  tokenType: string;
}
