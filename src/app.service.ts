import {Injectable, Logger} from '@nestjs/common';
import {MoreThan, DataSource} from "typeorm";
import {Comment, Token, TokenBalance, TokenWinner, UserAccount} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {GetTokenBalancesDto, GetTokensDto, GetTokenWinnersDto} from "./dto/token.dto";
import {Trade} from "./entities";
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

    async getTokenBalances(dto: GetTokenBalancesDto){
        const { offset = 0, limit = 100 } = dto
        return this.dataSource.manager.find(TokenBalance, {
            where: {
                token: {
                    address: dto.tokenAddress
                },
                user: {
                    address: dto.userAddress
                },
                balance: MoreThan('0')
            },
            order: {
                createdAt: 'desc'
            },
            take: limit,
            skip: offset
        })
    }

    async getTokenWinners(dto: GetTokenWinnersDto) {
        return await this.dataSource.manager.find(TokenWinner, {
            order: {
                timestamp: 'desc'
            },
            take: dto.limit,
            skip: dto.offset,
        })
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

    async getTokenHolder(tokenAddress: string, userAddress: string) {
        return await this.dataSource.manager.findOne(TokenBalance, {
            where: {
                token: {
                    address: tokenAddress.toLowerCase()
                },
                user: {
                    address: userAddress.toLowerCase()
                }
            }
        })
    }

    async createTokenHolder(token: Token, user: UserAccount) {
        return await this.dataSource.manager.insert(TokenBalance, {
            token,
            user,
        })
    }
}
