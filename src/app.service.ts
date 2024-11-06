import {Injectable, Logger} from '@nestjs/common';
import {Between, DataSource} from "typeorm";
import {Comment, Token} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {GetTokensDto} from "./dto/token.dto";
import {Trade} from "./entities";
import * as moment from "moment";
import {GetTradesDto} from "./dto/trade.dto";
import {UserService} from "./user/user.service";

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    constructor(
      private userService: UserService,
      private dataSource: DataSource,
    ) {}

    async getComments(dto: GetCommentsDto){
        return await this.dataSource.manager.find(Comment, {
            where: {
                token: {
                    address: dto.tokenAddress
                }
            },
            take: +dto.limit,
            skip: +dto.offset,
            order: {
                createdAt: 'asc'
            }
        })
    }

    async getTokens(dto: GetTokensDto){
        const { search, offset, limit } = dto
        const query = this.dataSource.getRepository(Token)
          .createQueryBuilder('token')
          .leftJoinAndSelect('token.user', 'user')
          // .leftJoinAndSelect('token.comments', 'comments')
          .offset(offset)
          .limit(limit)
          .orderBy({
              timestamp: 'DESC'
          })

        if(search) {
            query.where('token.name = :name', { name: search })
              .orWhere('token.address = :address', { address: search })
              .orWhere('token.symbol = :symbol', { symbol: search })
              .orWhere('token.txnHash = :txnHash', { txnHash: search })
        }

        return await query.getMany()
    }

    async getTrades(dto: GetTradesDto){
        return await this.dataSource.manager.find(Trade, {
            where: {
                token: {
                    address: dto.tokenAddress
                }
            },
            take: dto.limit,
            skip: dto.offset,
            order: {
                timestamp: 'desc'
            }
        })
    }

    async getTokenByAddress(address: string){
        return await this.dataSource.manager.findOne(Token, {
            where: {
                address
            }
        })
    }

    async getTokenById(tokenId: string){
        return await this.dataSource.manager.findOne(Token, {
            where: {
                id: tokenId
            }
        })
    }

    async addComment(dto: AddCommentDto): Promise<string> {
        const token = await this.getTokenByAddress(dto.tokenAddress)
        const user = await this.userService.getUserByAddress(dto.userAddress)
        const comment = this.dataSource.manager.create(Comment, {
            ...dto,
            token,
            user
        })
        const { identifiers } = await this.dataSource.manager.insert(Comment, comment)
        return identifiers[0].id
    }

    // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    // async handleCron() {
    //     const totalAttempts = 3
    //     for(let i = 0; i < totalAttempts; i++) {
    //         try {
    //             const winnerTokenId = await this.getDailyWinnerTokenId()
    //             this.logger.log(`Daily winner tokenId: ${winnerTokenId}`)
    //             break;
    //         } catch (e) {
    //             this.logger.error(`Failed to get daily winner, attempt: ${i+1}/${totalAttempts}`, e)
    //         }
    //     }
    // }

    async getDailyWinnerTokenId(): Promise<string | null> {
        const dateStart = moment().subtract(1, 'days').startOf('day')
        const dateEnd = moment().subtract(1, 'day').endOf('day')

        const tokensMap = new Map<string, bigint>()
        const tokens = await this.getTokens({ offset: 0, limit: 1000 })
        for(const token of tokens) {
            const tokenSwaps = await this.dataSource.manager.find(Trade, {
                where: {
                    token: {
                        id: token.id
                    },
                    createdAt: Between(dateStart.toDate(), dateEnd.toDate())
                }
            })
            const totalAmount = tokenSwaps.reduce((acc, item) => acc += BigInt(item.amountOut), 0n)
            tokensMap.set(token.id, totalAmount)
        }
        const sortedMapArray = ([...tokensMap.entries()]
          .sort(([aKey, aValue], [bKey, bValue]) => {
            return aValue - bValue > 0 ? -1 : 1
        }));
        if(sortedMapArray.length > 0) {
            const [winnerTokenId] = sortedMapArray[0]
            return winnerTokenId
        }
        return null
    }
}
