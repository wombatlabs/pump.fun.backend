import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query, UploadedFile, UseInterceptors,
  Headers
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {SkipThrottle} from "@nestjs/throttler";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {AppService} from "./app.service";
import {GetTokensDto} from "./dto/token.dto";
import {GetTradesDto} from "./dto/trade.dto";
import {AddUserDto, GetUsersDto} from "./dto/user.dto";
import {UserService} from "./user/user.service";
import {FileInterceptor} from "@nestjs/platform-express";
import { Storage } from '@google-cloud/storage'
import * as path from "node:path";
import {GcloudService} from "./gcloud/gcloud.service";
const serviceKey = path.join(__dirname, './keys.json')

@SkipThrottle()
@ApiTags('app')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly appService: AppService,
    private readonly userService: UserService,
    private readonly gCloudService: GcloudService
  ) {}
  @Get('/version')
  getVersion() {
    return this.configService.get('version');
  }

  @Get('/status')
  getStatus() {
    return 'OK';
  }

  @Get('/tokens')
  getTokens(@Query() dto: GetTokensDto) {
    return this.appService.getTokens(dto)
  }

  @Get('/comments')
  getComments(@Query() dto: GetCommentsDto) {
    return this.appService.getComments(dto)
  }

  @Post('/comment')
  async addComment(@Body() dto: AddCommentDto) {
    const token = await this.appService.getTokenByAddress(dto.tokenAddress)
    if(!token) {
      throw new NotFoundException('Token not found')
    }
    const user = await this.userService.getUserByAddress(dto.userAddress)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    return await this.appService.addComment(dto)
  }

  @Get('/trades')
  getTrades(@Query() dto: GetTradesDto) {
    return this.appService.getTrades(dto)
  }

  @Post('/user')
  async addUser(@Body() dto: AddUserDto) {
    console.log('dto', dto)
    const user = await this.userService.getUserByAddress(dto.address)
    if(user) {
      throw new BadRequestException('User already exists')
    }
    const userId = await this.userService.addNewUser(dto);
    this.logger.log(`Created new user: address=${dto.address}, id=${userId}`)
    return await this.userService.getUserByAddress(dto.address)
  }

  @Get('/user/:address')
  async getUserByAddress(@Param('address') address: string) {
    const user = await this.userService.getUserByAddress(address)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Post('/uploadImage')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() uploadedFile: Express.Multer.File, @Headers() headers) {
    const userAddress = headers['meta_user_address']
    const publicImageUrl = await this.gCloudService.uploadImage(userAddress, uploadedFile)
    this.logger.log(`Image uploaded, publicUrl=${publicImageUrl}, userAddress=${userAddress}`)
    return publicImageUrl
  }
}
