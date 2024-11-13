import { Injectable } from '@nestjs/common';
import {DataSource, EntityManager} from "typeorm";
import {SignInRequestEntity, Token, UserAccount} from "../entities";
import {AddUserDto, GetUsersDto} from "../dto/user.dto";
import {generateNonce} from "../utils";
import {VerifySignatureDto} from "../dto/account.dto";
import {verifyMessage} from "ethers";
import * as uuid from 'uuid';
import {JwtService, JwtSignOptions} from "@nestjs/jwt";
import {ConfigService} from "@nestjs/config";
import {plainToClass} from "class-transformer";
import {JwtTokensDto} from "../dto/jwt.dto";

@Injectable()
export class UserService {
  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
    private jwtService: JwtService,
    ) {
  }

  async getSignInRequest(address: string) {
    return await this.dataSource.manager.findOne(SignInRequestEntity, {
      where: {
        address: address.toLowerCase()
      }
    });
  }

  async createSignInRequest(address: string) {
    const nonce = generateNonce()
    const signInRequestEntity = this.dataSource.manager.create(SignInRequestEntity, {
      address,
      nonce,
    });
    await this.dataSource.manager.save(signInRequestEntity);
    return signInRequestEntity
  }

  async verifySignature(
    dto: VerifySignatureDto,
    nonce: number
  ) {
    const { address, signature } = dto

    const rawMessage = `I'm signing my one-time nonce: ${nonce}`;
    const decodedAddress = verifyMessage(rawMessage, signature)
    return decodedAddress.toLowerCase() === address.toLowerCase()
  }

  async deleteSignInRequest(address: string) {
    return await this.dataSource.manager.delete(SignInRequestEntity, {
      address,
    });
  }

  private async getAccessToken(payload: object, options: JwtSignOptions) {
    return await this.jwtService.signAsync(payload, {
      ...options,
      expiresIn: this.configService.get('JWT_EXPIRATION_DATE')
    })
  }

  private async getRefreshToken(payload: object, options: JwtSignOptions) {
    return await this.jwtService.signAsync(payload, {
      ...options,
      expiresIn: this.configService.get('REFRESH_EXPIRATION_DATE'),
    })
  }

  async getTokens(payload: object) {
    const jwtid = uuid.v4();

    const accessToken = await this.getAccessToken(payload, { jwtid })
    const refreshToken = await this.getRefreshToken(payload, { jwtid })

    return plainToClass(JwtTokensDto, {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
    });
  }

  async createUser(dto: AddUserDto, entityManager?: EntityManager) {
    const { address } = dto

    const data = await (entityManager || this.dataSource.manager).insert(UserAccount, {
      address: address.toLowerCase(),
      username: address.replaceAll('0x', '').slice(0, 6)
    })
    return data.identifiers[0].id
  }

  async getUserByAddress(address: string, entityManager?: EntityManager) {
    return await (entityManager || this.dataSource.manager).findOne(UserAccount, {
      where: {
        address: address.toLowerCase(),
      },
    })
  }

  async getTokensCreated(userAddress: string) {
    return await this.dataSource.manager.find(Token, {
      relations: ['user'],
      where: {
        user: {
          address: userAddress.toLowerCase()
        }
      },
      order: {
        createdAt: 'desc'
      }
    })
  }
}
