import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Contract, ContractAbi, EventLog, Web3} from "web3";
import * as TokenFactoryABI from './abi/TokenFactory.json'
import {Between, DataSource} from "typeorm";
import {Token} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {Comment} from "./entities/comment.entity";
import {GetTokensDto} from "./dto/token.dto";
import * as process from "node:process";
import {Trade, TradeType} from "./entities/trade.entity";
import {Cron, CronExpression} from "@nestjs/schedule";
import * as moment from "moment";
import {GetTradesDto} from "./dto/trade.dto";

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly web3: Web3
    private readonly tokenFactoryContract: Contract<ContractAbi>
    private readonly blocksIndexingRange = 1000
    constructor(
      private configService: ConfigService,
      private dataSource: DataSource,
    ) {
        const rpcUrl = configService.get('RPC_URL')
        const contractAddress = configService.get('PUMP_FUN_CONTRACT_ADDRESS')
        const initialBlockNumber = configService.get('PUMP_FUN_INITIAL_BLOCK_NUMBER')

        if(!contractAddress) {
            this.logger.error(`[PUMP_FUN_CONTRACT_ADDRESS] is missing but required, exit`)
            process.exit(1)
        }

        if(!initialBlockNumber) {
            this.logger.error(`[PUMP_FUN_INITIAL_BLOCK_NUMBER] is missing but required, exit`)
            process.exit(1)
        }

        this.logger.log(`Starting app service, RPC_URL=${
            rpcUrl
        }, PUMP_FUN_CONTRACT_ADDRESS=${
            contractAddress
        }, PUMP_FUN_INITIAL_BLOCK_NUMBER=${
            initialBlockNumber
        }`)

        this.web3 = new Web3(rpcUrl);
        this.tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, contractAddress);
        this.eventsTrackingLoop()
        this.logger.log(`App service started`)
    }

    private async processTradeEvents(events: EventLog[], tradeType: TradeType) {
        for(const event of events) {
            const txnHash = event.transactionHash
            const blockNumber = event.blockNumber.toString()
            const values = event.returnValues
            const tokenAddress = values['token'] as string
            const amountIn = String(values['amount0In'] as bigint)
            const amountOut = String(values['amount0Out'] as bigint)
            const fee = String(values['fee'] as bigint)
            const timestamp = Number(values['timestamp'] as bigint)

            const token = await this.getTokenByAddress(tokenAddress)
            if(!token) {
                this.logger.error(`swap event: failed to get token by address="${tokenAddress}", event tx hash="${event.transactionHash}", exit`)
                process.exit(1)
            }

            try {
                await this.dataSource.manager.insert(Trade, {
                    type: tradeType,
                    txnHash,
                    blockNumber,
                    token,
                    amountIn,
                    amountOut,
                    fee,
                    timestamp
                });
                this.logger.log(`Trade [${tradeType}]: token=${tokenAddress}, amountIn=${amountIn}, amountOut=${amountOut}, fee=${fee}`)
            } catch (e) {
                this.logger.error(`Failed to process swap token=${tokenAddress} txnHash=${txnHash}`, e)
                throw new Error(e);
            }
        }
    }

    private async getLatestIndexedBlockNumber() {
        const lastToken = await this.dataSource.manager.findOne(Token, {
            where: {},
            order: {
                createdAt: 'desc'
            }
        })
        const lastTrade = await this.dataSource.manager.findOne(Trade, {
            where: {},
            order: {
                createdAt: 'desc'
            }
        })
        if(lastToken || lastTrade) {
           return Math.max(+lastToken?.blockNumber || 0, +lastTrade?.blockNumber || 0)
        }
        return 0
    }

    async eventsTrackingLoop(
      fromBlockParam?: number
    ) {
        if(!fromBlockParam) {
            const lastIndexedBlockNumber = await this.getLatestIndexedBlockNumber()
            if(lastIndexedBlockNumber) {
                fromBlockParam = lastIndexedBlockNumber + 1
                this.logger.log(`Starting from the last block from DB: ${fromBlockParam}`)
            } else {
                fromBlockParam = +this.configService.get<number>('PUMP_FUN_INITIAL_BLOCK_NUMBER')
                this.logger.log(`Starting from the last block from config: ${fromBlockParam}`)
            }

        }

        let fromBlock = fromBlockParam
        let toBlock = fromBlock
        try {
            const blockchainBlockNumber = +(String(await this.web3.eth.getBlockNumber()))
            toBlock = fromBlock + this.blocksIndexingRange - 1
            if(toBlock > blockchainBlockNumber) {
                toBlock = blockchainBlockNumber
            }

            if(toBlock - fromBlock >= 1) {
                const tokenCreatedEvents = await this.tokenFactoryContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [
                      this.web3.utils.sha3('TokenCreated(address,uint256)'),
                    ],
                }) as EventLog[];

                const buyEvents = await this.tokenFactoryContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [
                        this.web3.utils.sha3('TokenBuy(address,uint256,uint256,uint256,uint256)'),
                    ],
                }) as EventLog[];

                const sellEvents = await this.tokenFactoryContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [
                        this.web3.utils.sha3('TokenSell(address,uint256,uint256,uint256,uint256)'),
                    ],
                }) as EventLog[];

                for(const tokenCreated of tokenCreatedEvents) {
                    const txnHash = tokenCreated.transactionHash
                    const values = tokenCreated.returnValues
                    const tokenAddress = values['token'] as string
                    const timestamp = Number(values['timestamp'] as bigint)

                    await this.dataSource.manager.insert(Token, {
                        txnHash,
                        address: tokenAddress,
                        blockNumber: String(tokenCreated.blockNumber),
                        timestamp
                    });
                    this.logger.log(`New token: address=${tokenAddress}, txnHash=${txnHash}, timestamp=${timestamp}`)
                }

                await this.processTradeEvents(buyEvents, TradeType.buy)
                await this.processTradeEvents(sellEvents, TradeType.sell)

                this.logger.log(`[${fromBlock}-${toBlock}] (${((toBlock - fromBlock + 1))} blocks), new tokens=${tokenCreatedEvents.length}, trade=${[...buyEvents, ...sellEvents].length} (buy=${buyEvents.length}, sell=${sellEvents.length})`)
                toBlock += 1
            } else {
                // Wait for blockchain
                toBlock = fromBlockParam
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
            }
        } catch (e) {
            toBlock = fromBlockParam
            this.logger.error(`[${fromBlock} - ${toBlock}] Failed to index blocks range:`, e)
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        }
        this.eventsTrackingLoop(toBlock)
    }

    async getComments(dto: GetCommentsDto){
        return await this.dataSource.manager.find(Comment, {
            where: {
                token: {
                    id: dto.tokenId
                }
            },
            take: +dto.limit,
            skip: +dto.offset,
            order: {
                createdAt: 'desc'
            }
        })
    }

    async getTokens(dto: GetTokensDto){
        return await this.dataSource.manager.find(Token, {
            where: {},
            take: dto.limit,
            skip: dto.offset,
            order: {
                createdAt: 'desc'
            }
        })
    }

    async getTrades(dto: GetTradesDto){
        return await this.dataSource.manager.find(Trade, {
            where: {
                token: {
                    id: dto.tokenId
                }
            },
            take: dto.limit,
            skip: dto.offset,
            order: {
                createdAt: 'desc'
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
        const token = await this.getTokenById(dto.tokenId)
        const comment = this.dataSource.manager.create(Comment, {
            ...dto,
            token
        })
        const { identifiers } = await this.dataSource.manager.insert(Comment, comment)
        return identifiers[0].id
    }

    // '0 0 * * * *'
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async handleCron() {
        const totalAttempts = 3
        for(let i = 0; i < totalAttempts; i++) {
            try {
                const winnerTokenId = await this.getDailyWinnerToKenId()
                this.logger.log(`Daily winner tokenId: ${winnerTokenId}`)
                break;
            } catch (e) {
                this.logger.error(`Failed to get daily winner, attempt: ${i+1}/${totalAttempts}`, e)
            }
        }
    }

    async getDailyWinnerToKenId(): Promise<string | null> {
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
