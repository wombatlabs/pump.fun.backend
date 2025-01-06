import {Injectable, Logger} from '@nestjs/common';
import {DataSource, EntityManager, LessThan, MoreThan} from "typeorm";
import {
    Comment,
    CompetitionEntity,
    LiquidityProvision,
    Token,
    TokenBalance,
    TokenBurn,
    Trade,
    UserAccount
} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {GetTokenBalancesDto, GetTokenBurnsDto, GetTokensDto, GetTokenWinnersDto} from "./dto/token.dto";
import {GetCandlesDto, GetTradesDto} from "./dto/trade.dto";
import {UserService} from "./user/user.service";
import {Candle, CandleIntervalPgAlias} from "./types";
import {GetWinnerLiquidityProvisionsDto} from "./dto/winner.liquidity.dto";
import {GetCompetitionsDto} from "./dto/competition.dto";

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
        const {
            search,
            offset,
            limit,
            isWinner,
            sortingField,
            sortingOrder,
            competitionId,
            symbol
        } = dto
        const query = this.dataSource.getRepository(Token)
          .createQueryBuilder('token')
          .leftJoinAndSelect('token.user', 'user')
          .leftJoinAndSelect('token.competition', 'competition')
          .loadRelationCountAndMap('token.commentsCount', 'token.comments')
          .where('token.isEnabled', { isEnabled: true })
          .offset(offset)
          .limit(limit)

        if(search) {
            query.where('LOWER(token.name) LIKE LOWER(:name)', { name: `%${search}%` })
              .orWhere('LOWER(token.address) = LOWER(:address)', { address: search })
              .orWhere('LOWER(token.symbol) LIKE LOWER(:symbol)', { symbol: `%${search}%` })
              .orWhere('LOWER(token.txnHash) = LOWER(:txnHash)', { txnHash: search })
        }

        if(symbol) {
            query.where('LOWER(symbol) = LOWER(:symbol)', { symbol })
        }

        if(competitionId) {
            query.where('competition.competitionId = :competitionId', { competitionId })
        }

        if(typeof isWinner !== 'undefined') {
            query.andWhere({ isWinner })
        }

        if(sortingField && sortingOrder) {
            query.orderBy({
                [`"${sortingField}"`]: sortingOrder
            })
        } else {
            query.orderBy({
                timestamp: 'DESC'
            })
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
                balance: 'desc'
            },
            take: limit,
            skip: offset
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

    async getCompetitions(dto: GetCompetitionsDto = {}, entityManager?: EntityManager) {
        const {offset = 0, limit = 100, competitionId} = dto

        return await (entityManager || this.dataSource.manager).find(CompetitionEntity, {
            relations: ['winnerToken'],
            where: {
                competitionId
            },
            order: {
                competitionId: 'desc'
            },
            skip: offset,
            take: limit
        })
    }

    async getTokenBurns(dto: GetTokenBurnsDto){
        return await this.dataSource.manager.find(TokenBurn, {
            where: {
                token: {
                    address: dto.tokenAddress
                },
                sender: {
                    address: dto.userAddress
                }
            },
            take: dto.limit,
            skip: dto.offset,
            order: {
                timestamp: 'desc'
            }
        })
    }

    async getWinnerLiquidityProvisions(dto: GetWinnerLiquidityProvisionsDto){
        return await this.dataSource.manager.find(LiquidityProvision, {
            where: {
                token: {
                    address: dto.tokenAddress
                },
                sender: dto.sender
            },
            take: dto.limit,
            skip: dto.offset,
            order: {
                timestamp: 'desc'
            }
        })
    }

    async getCandles(dto: GetCandlesDto){
        const { timestampFrom, timestampTo, tokenAddress, interval = '1h' } = dto

        const timeInterval = CandleIntervalPgAlias[interval] || 'hour'

        const query = this.dataSource.getRepository(Trade)
          .createQueryBuilder('trades')
          .leftJoin('trades.token', 'token')
          .select([
            `DATE_TRUNC('${timeInterval}', to_timestamp(trades.timestamp)) AS time`,
            `MAX(trades.price)::DOUBLE PRECISION AS "highPrice"`,
            `MIN(trades.price)::DOUBLE PRECISION AS "lowPrice"`,
            `SUM(
                CASE
                    WHEN trades.type = 'buy'
                    THEN trades."amountIn"
                    ELSE trades."amountOut"
                    END
                )::DOUBLE PRECISION AS "volume"
            `,
            // `
            //     FIRST_VALUE(trades.price)
            //     OVER (
            //         PARTITION BY DATE_TRUNC('${timeInterval}', to_timestamp(trades.timestamp))
            //         ORDER BY trades.timestamp ASC
            //     ) AS "openPrice"
            // `,
            //   `
            //     LAST_VALUE(trades.price)
            //     OVER (
            //         PARTITION BY DATE_TRUNC('${timeInterval}', to_timestamp(trades.timestamp))
            //         ORDER BY trades.timestamp DESC
            //     ) AS "closePrice"
            // `,
          ])
          .where({
              token: {
                  address: tokenAddress
              }
          })
          .groupBy('time')
          // .addGroupBy('trades.price')
          // .addGroupBy('trades.timestamp')
          .orderBy({
              time: 'ASC'
          })
          .offset(0)
          .limit(100)

        if(timestampFrom) {
            query.andWhere({
                timestamp: MoreThan(timestampFrom)
            })
        }

        if(timestampTo) {
            query.andWhere({
                timestamp: LessThan(timestampTo)
            })
        }

        return await query.getRawMany<Candle[]>()
    }

    async getTokenByAddress(address: string, entityManager?: EntityManager){
        return await (entityManager || this.dataSource.manager).findOne(Token, {
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

    async addComment(userAddress: string, dto: AddCommentDto): Promise<string> {
        const token = await this.getTokenByAddress(dto.tokenAddress)
        const user = await this.userService.getUserByAddress(userAddress)
        const comment = this.dataSource.manager.create(Comment, {
            ...dto,
            token,
            user
        })
        const { identifiers } = await this.dataSource.manager.insert(Comment, comment)
        return identifiers[0].id
    }

    async getTokenHolder(tokenAddress: string, userAddress: string, entityManager?: EntityManager) {
        return await (entityManager || this.dataSource.manager).findOne(TokenBalance, {
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

    async createTokenHolder(token: Token, user: UserAccount, entityManager?: EntityManager) {
        return await (entityManager || this.dataSource.manager).insert(TokenBalance, {
            token,
            user,
        })
    }
}
