import {
  BadRequestException,
  Body,
  Controller, Get,
  HttpCode,
  HttpStatus,
  Logger, NotFoundException, Param,
  Post, UnauthorizedException,
  UsePipes,
  ValidationPipe,
  Request, UseGuards, InternalServerErrorException
} from '@nestjs/common';
import {ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags} from "@nestjs/swagger";
import {validationCfg} from "../common/validation.cfg";
import {SignInRequestDto, VerifySignatureDto} from "../dto/account.dto";
import {UserService} from "./user.service";
import {JwtTokenDto, JwtTokensDto} from "../dto/jwt.dto";
import {instanceToPlain, plainToInstance} from "class-transformer";
import {JwtService} from "@nestjs/jwt";
import {AddUserDto} from "../dto/user.dto";
import {JwtUserAccount} from "../entities/user-account.entity";
import {AuthGuard} from "../common/auth.guard";

@Controller('user')
@ApiTags('user')
export class UserController {
  private readonly logger = new Logger(UserController.name);
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('/')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe(validationCfg()))
  async addUser(@Request() req) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address } = plainToInstance(JwtUserAccount, req.user)
    const user = await this.userService.getUserByAddress(address)
    if(user) {
      throw new BadRequestException('User already exists')
    }
    const userId = await this.userService.createUser({ address });
    this.logger.log(`New user created: address=${address}, id=${userId}`)
    return await this.userService.getUserByAddress(address)
  }

  @HttpCode(HttpStatus.OK)
  @Post('nonce')
  @ApiOperation({
    summary: 'Request one-time nonce',
  })
  @UsePipes(new ValidationPipe(validationCfg()))
  async getNonce(@Body() dto: SignInRequestDto) {
    const { address } = dto

    const existedRequest = await this.userService.getSignInRequest(address);
    if(existedRequest) {
      return {
        nonce: existedRequest.nonce
      }
    } else {
      const request = await this.userService.createSignInRequest(address)
      this.logger.log(`New signin request: ${address}, nonce: ${request.nonce}`)
      return {
        nonce: request.nonce
      }
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify')
  @ApiOperation({
    summary: 'Verify signIn signature',
  })
  @ApiOkResponse({ type: JwtTokensDto })
  @UsePipes(new ValidationPipe(validationCfg()))
  async verifySignature(@Body() dto: VerifySignatureDto) {
    const { address } = dto

    const signInRequest = await this.userService.getSignInRequest(address)
    if(!signInRequest) {
      throw new BadRequestException('SignInRequestNotFound')
    }

    const isValidSignature = await this.userService.verifySignature(dto, signInRequest.nonce)
    if(isValidSignature) {
      let user = await this.userService.getUserByAddress(address)
      if(!user) {
        await this.userService.createUser({ address })
        this.logger.log(`Created new user, address=${address}`)
        user = await this.userService.getUserByAddress(address)
      }
      if(!user) {
        throw new InternalServerErrorException(`Failed to create user, address=${address}`)
      }
      // const payload = instanceToPlain(user)
      const payload: JwtUserAccount = {
        address: user.address,
        username: user.username,
        createdAt: user.createdAt
      }

      const jwt = await this.userService.getTokens(payload)
      await this.userService.deleteSignInRequest(address)

      this.logger.log(`Sign-in success, signature is valid, address=${address}`)
      return jwt
    }

    throw new BadRequestException('Invalid signature or address')
  }

  @Get('/sign-in')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @UsePipes(new ValidationPipe(validationCfg()))
  async signIn(@Request() req) {
    if(!req.user) {
      throw new BadRequestException('InvalidJWT')
    }
    const { address } = plainToInstance(JwtUserAccount, req.user)
    const user = await this.userService.getUserByAddress(address)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    const payload: JwtUserAccount = {
      address: user.address,
      username: user.username,
      createdAt: user.createdAt
    }
    // Refresh tokens
    const tokens = await this.userService.getTokens(payload)
    return {
      tokens,
      user
    }
  }

  @Post('/refresh')
  @ApiOperation({
    summary: 'Update refresh token',
  })
  @ApiOkResponse({ type: JwtTokensDto })
  async refreshToken(@Body() body: JwtTokenDto) {
    try {
      const userData = this.jwtService.verify(body.token);
      delete userData.iat;
      delete userData.exp;
      delete userData.jti;
      return await this.userService.getTokens(userData)
    } catch (e) {}

    throw new UnauthorizedException();
  }

  @Get('/:address')
  async getUserByAddress(@Param('address') userAddress: string) {
    const user = await this.userService.getUserByAddress(userAddress)
    if(!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  @Get('/:address/tokens/created')
  async getUserTokensCreated(@Param('address') userAddress: string) {
    return await this.userService.getTokensCreated(userAddress)
  }
}
