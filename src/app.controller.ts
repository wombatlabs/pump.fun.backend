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
  Headers, UseGuards, Request
} from '@nestjs/common';
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {SkipThrottle} from "@nestjs/throttler";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {AppService} from "./app.service";
import {GetTokenBalancesDto, GetTokensDto, GetTokenWinnersDto} from "./dto/token.dto";
import {GetCandlesDto, GetTradesDto} from "./dto/trade.dto";
import {AddUserDto} from "./dto/user.dto";
import {UserService} from "./user/user.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {GcloudService} from "./gcloud/gcloud.service";
import { v4 as uuidv4 } from 'uuid';
import {AddTokenMetadataDto} from "./dto/metadata.dto";
import {AuthGuard} from "./common/auth.guard";
import {plainToInstance} from "class-transformer";
import {JwtUserAccount} from "./entities/user-account.entity";

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

  // @Get('/token/candles')
  // async getCandles(@Query() dto: GetCandlesDto) {
  //   return await this.appService.getCandles(dto)
  // }

  @Get('/comments')
  getComments(@Query() dto: GetCommentsDto) {
    return this.appService.getComments(dto)
  }

  @Post('/comment')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async addComment(@Request() req, @Body() dto: AddCommentDto) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address } = plainToInstance(JwtUserAccount, req.user)
    const token = await this.appService.getTokenByAddress(dto.tokenAddress)
    if(!token) {
      throw new NotFoundException('Token not found')
    }
    const user = await this.userService.getUserByAddress(address)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    return await this.appService.addComment(address, dto)
  }

  @Get('/trades')
  getTrades(@Query() dto: GetTradesDto) {
    return this.appService.getTrades(dto)
  }

  @Post('/uploadImage')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Request() req,
    @UploadedFile() uploadedFile: Express.Multer.File,
    @Headers() headers
  ) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address } = plainToInstance(JwtUserAccount, req.user)
    const uuid = uuidv4()
    const imageUrl = await this.gCloudService.uploadImage(uploadedFile, uuid)
    this.logger.log(`Image uploaded, imageUrl=${imageUrl}, userAddress=${address}`)
    return imageUrl
  }

  @Post('/metadata')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async addMetadata(@Request() req, @Body() dto: AddTokenMetadataDto) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address } = plainToInstance(JwtUserAccount, req.user)

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
    this.logger.log(`Metadata uploaded, userAddress=${address} url=${metadataUrl}, content: ${JSON.stringify(dto)}`)
    return metadataUrl
  }
}
