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
import {GetTokenBalancesDto, GetTokensDto, GetTokenWinnersDto} from "./dto/token.dto";
import {GetTradesDto} from "./dto/trade.dto";
import {AddUserDto} from "./dto/user.dto";
import {UserService} from "./user/user.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {GcloudService} from "./gcloud/gcloud.service";
import { v4 as uuidv4 } from 'uuid';
import {AddTokenMetadataDto} from "./dto/metadata.dto";

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

  @Get('/token/balances')
  getTokenHolders(@Query() dto: GetTokenBalancesDto) {
    return this.appService.getTokenBalances(dto)
  }

  @Get('/token/winners')
  getWinners(@Query() dto: GetTokenWinnersDto) {
    return this.appService.getTokenWinners(dto)
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
  async getUserByAddress(@Param('address') userAddress: string) {
    const user = await this.userService.getUserByAddress(userAddress)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Get('/user/:address/tokens/created')
  async getUserTokensCreated(@Param('address') userAddress: string) {
    return await this.userService.getTokensCreated(userAddress)
  }

  @Post('/uploadImage')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() uploadedFile: Express.Multer.File, @Headers() headers) {
    const userAddress = headers['meta_user_address']
    const uuid = uuidv4()
    const imageUrl = await this.gCloudService.uploadImage(uploadedFile, uuid)
    this.logger.log(`Image uploaded, imageUrl=${imageUrl}, userAddress=${userAddress}`)
    return imageUrl
  }

  @Post('/metadata')
  async addMetadata(@Body() dto: AddTokenMetadataDto) {
    let uuid = ''

    if(!dto.image) {
      throw new BadRequestException('Image property is missing')
    }

    const imageItems = dto.image.split('/')
    if(imageItems.length > 0) {
      uuid = imageItems[imageItems.length - 1].split('.')[0]
    } else {
      throw new BadRequestException('Invalid image url')
    }

    if(!uuid) {
      throw new BadRequestException('Failed to get uuid')
    }

    const metadataUrl = await this.gCloudService.uploadMetadata(dto, uuid)
    this.logger.log(`Metadata uploaded, url=${metadataUrl}, content: ${JSON.stringify(dto)}`)
    return metadataUrl
  }
}
