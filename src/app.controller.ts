import {Body, Controller, Get, NotFoundException, Post, Query} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import {SkipThrottle} from "@nestjs/throttler";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {AppService} from "./app.service";
import {GetTokensDto} from "./dto/token.dto";
import {GetSwapsDto} from "./dto/swap.dto";

@SkipThrottle()
@ApiTags('app')
@Controller()
export class AppController {
  constructor(
    private readonly configService: ConfigService,
    private readonly appService: AppService
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
    const token = await this.appService.getTokenById(dto.tokenId)
    if(!token) {
      throw new NotFoundException('Token not found')
    }
    return await this.appService.addComment(dto)
  }

  @Get('/swaps')
  getSwaps(@Query() dto: GetSwapsDto) {
    return this.appService.getSwaps(dto)
  }
}
