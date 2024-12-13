import {ApiProperty} from "@nestjs/swagger";
import {Transform, Type} from "class-transformer";
import {IsBoolean, IsString} from "class-validator";

export class BlacklistTokenDto {
  @ApiProperty({ type: String, required: true })
  @Transform((address) => address.value.trim().toLowerCase())
  @Type(() => String)
  @IsString()
  tokenAddress: string;

  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  isEnabled: boolean;
}
