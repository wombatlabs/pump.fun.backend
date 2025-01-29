import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  ForbiddenException,
  Get,
  Logger,
  MaxFileSizeValidator,
  NotFoundException,
  ParseFilePipe,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import {ApiBearerAuth, ApiTags} from '@nestjs/swagger';
import {ConfigService} from '@nestjs/config';
import {SkipThrottle} from "@nestjs/throttler";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {AppService} from "./app.service";
import {GetTokenBalancesDto, GetTokenBurnsDto, GetTokensDto} from "./dto/token.dto";
import {GetCandlesDto, GetTradesDto} from "./dto/trade.dto";
import {UserService} from "./user/user.service";
import {FileInterceptor} from "@nestjs/platform-express";
import {GcloudService} from "./gcloud/gcloud.service";
import {v4 as uuidv4} from 'uuid';
import {AddTokenMetadataDto} from "./dto/metadata.dto";
import {AuthGuard} from "./common/auth.guard";
import {plainToInstance} from "class-transformer";
import {JwtUserAccount} from "./entities/user-account.entity";
import {GetWinnerLiquidityProvisionsDto} from "./dto/winner.liquidity.dto";
import {CacheTTL} from "@nestjs/common/cache";
import {IndexerService} from "./indexer/indexer.service";
import {GetCompetitionsDto} from "./dto/competition.dto";
import {AddReportDto, GetReportsDto} from "./dto/report.dto";

@SkipThrottle()
@ApiTags('app')
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly appService: AppService,
    private readonly userService: UserService,
    private readonly gCloudService: GcloudService,
    private readonly indexerService: IndexerService,
  ) {}
  @Get('/version')
  getVersion() {
    return this.configService.get('version');
  }

  @Get('/status')
  async getStatus() {
    const latestIndexedBlock = await this.indexerService.getLatestIndexedBlockNumber();
    return {
      latestIndexedBlock,
    }
  }

  @CacheTTL(200)
  @Get('/tokens')
  getTokens(@Query() dto: GetTokensDto) {
    return this.appService.getTokens(dto)
  }

  @CacheTTL(200)
  @Get('/balances')
  getTokenHolders(@Query() dto: GetTokenBalancesDto) {
    return this.appService.getTokenBalances(dto)
  }

  @CacheTTL(200)
  @Get('/candles')
  async getCandles(@Query() dto: GetCandlesDto) {
    return await this.appService.getCandles(dto)
  }

  @CacheTTL(200)
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

  @CacheTTL(200)
  @Get('/trades')
  getTrades(@Query() dto: GetTradesDto) {
    return this.appService.getTrades(dto)
  }

  @CacheTTL(200)
  @Get('/competitions')
  getCompetitions(@Query() dto: GetCompetitionsDto) {
    return this.appService.getCompetitions(dto)
  }

  @CacheTTL(200)
  @Get('/tokenBurns')
  getTokenBurns(@Query() dto: GetTokenBurnsDto) {
    return this.appService.getTokenBurns(dto)
  }

  @CacheTTL(200)
  @Get('/winnerLiquidityProvisions')
  getWinnerLiquidityProvisions(@Query() dto: GetWinnerLiquidityProvisionsDto) {
    return this.appService.getWinnerLiquidityProvisions(dto)
  }

  @Post('/uploadImage')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Request() req,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|gif)' }),
        ]
      })
    ) file: Express.Multer.File,
  ) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address, isEnabled } = plainToInstance(JwtUserAccount, req.user)

    if(!isEnabled) {
      throw new ForbiddenException('User account is disabled')
    }

    const uuid = uuidv4()
    const imageUrl = await this.gCloudService.uploadImage(file, uuid)
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
    const { address, isEnabled } = plainToInstance(JwtUserAccount, req.user)

    if(!isEnabled) {
      throw new ForbiddenException('User account is disabled')
    }

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

  @Post('/report')
  async addReport(@Body() dto: AddReportDto) {
    if(!dto.tokenAddress && !dto.userAddress) {
      throw new BadRequestException('No token or user address provided')
    }

    const existedReports = await this.appService.getReports(dto)
    if(existedReports.length > 0) {
      throw new BadRequestException('Report already exists')
    }

    return await this.appService.addReport(dto)
  }

  @CacheTTL(200)
  @Get('/reports')
  async getReports(@Query() dto: GetReportsDto) {
    return await this.appService.getReports(dto)
  }
}
