import {Body, Controller, NotFoundException, Post, UseGuards} from '@nestjs/common';
import {ApiKeyGuard} from "../common/apiKey.guard";
import {BlacklistTokenDto} from "../dto/blacklist.dto";
import {AdminService} from "./admin.service";
import {AppService} from "../app.service";

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly appService: AppService
  ) {}

  @UseGuards(ApiKeyGuard)
  @Post('blacklist')
  async blacklistToken(@Body() dto: BlacklistTokenDto) {
    const token = await this.appService.getTokenByAddress(dto.tokenAddress)
    if(!token) {
      throw new NotFoundException("Token not found");
    }
    return await this.adminService.blacklistToken(dto)
  }
}
