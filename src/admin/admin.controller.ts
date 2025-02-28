import {Body, Controller, Delete, NotFoundException, Post, UseGuards} from '@nestjs/common';
import {ApiKeyGuard} from "../common/apiKey.guard";
import {BlacklistDto} from "../dto/blacklist.dto";
import {AdminService} from "./admin.service";
import {AppService} from "../app.service";
import {UserService} from "../user/user.service";
import {DeleteUserCommentsDto} from "../dto/comment.dto";

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly userService: UserService,
    private readonly appService: AppService
  ) {}

  @UseGuards(ApiKeyGuard)
  @Post('blacklist')
  async blacklist(@Body() dto: BlacklistDto) {
    const { tokenAddress, userAddress } = dto

    if(tokenAddress) {
      const token = await this.appService.getTokenByAddress(tokenAddress)
      if(!token) {
        throw new NotFoundException("Token not found");
      }
      return await this.adminService.blacklistToken(dto)
    } else if(userAddress) {
      const user = await this.userService.getUserByAddress(userAddress)
      if(!user) {
        throw new NotFoundException("User not found");
      }
      return await this.adminService.blacklistUser(dto)
    }

    throw new NotFoundException("tokenAddress or userAddress not specified");
  }

  @UseGuards(ApiKeyGuard)
  @Delete('comments/by-user')
  async deleteUserComments(@Body() dto: DeleteUserCommentsDto) {
    const { userAddress } = dto

    if(userAddress) {
      return await this.appService.deleteUserComments(userAddress)
    } else {
      throw new NotFoundException("userAddress is required");
    }
  }
}
