import { Injectable } from '@nestjs/common';
import {DataSource} from "typeorm";
import {BlacklistTokenDto} from "../dto/blacklist.dto";
import {Token} from "../entities";

@Injectable()
export class AdminService {
  constructor(private dataSource: DataSource) {}

  async blacklistToken(dto: BlacklistTokenDto) {
    const token = await this.dataSource.manager.findOne(Token, {
      where: {
        address: dto.tokenAddress
      }
    })
    token.isEnabled = dto.isEnabled
    await this.dataSource.manager.save(token)
    return token
  }
}
