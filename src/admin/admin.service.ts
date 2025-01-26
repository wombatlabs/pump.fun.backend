import { Injectable } from '@nestjs/common';
import {DataSource} from "typeorm";
import {BlacklistDto} from "../dto/blacklist.dto";
import {Token, UserAccount} from "../entities";

@Injectable()
export class AdminService {
  constructor(private dataSource: DataSource) {}

  async blacklistToken(dto: BlacklistDto) {
    const token = await this.dataSource.manager.findOne(Token, {
      where: {
        address: dto.tokenAddress
      }
    })
    token.isEnabled = dto.isEnabled
    await this.dataSource.manager.save(token)
    return token
  }

  async blacklistUser(dto: BlacklistDto) {
    const user = await this.dataSource.manager.findOne(UserAccount, {
      where: {
        address: dto.userAddress
      }
    })
    user.isEnabled = dto.isEnabled
    await this.dataSource.manager.save(user)
    return user
  }
}
