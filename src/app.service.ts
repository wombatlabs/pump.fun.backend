import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Contract, ContractAbi, EventLog, Web3} from "web3";
import * as TokenFactoryABI from './abi/TokenFactory.json'
import {Between, DataSource} from "typeorm";
import {Comment, IndexerState, Token, UserAccount} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {GetTokensDto} from "./dto/token.dto";
import * as process from "node:process";
import {Trade} from "./entities";
import {Cron, CronExpression} from "@nestjs/schedule";
import * as moment from "moment";
import {GetTradesDto} from "./dto/trade.dto";
import {UserService} from "./user/user.service";
import axios from "axios";
import {TokenMetadata, TradeEventLog, TradeType} from "./types";

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly web3: Web3
    private readonly tokenFactoryContract: Contract<ContractAbi>
    private readonly blocksIndexingRange = 1000
    constructor(
      private configService: ConfigService,
      private userService: UserService,
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
        this.bootstrap().then(
          () => {
              this.eventsTrackingLoop()
          }
        )
        this.logger.log(`App service started`)
    }

    private async bootstrap() {
        try {
            const indexerState = await this.dataSource.manager.findOne(IndexerState, {
                where: {}
            })
            if(!indexerState) {
                const blockNumber = +this.configService.get<number>('PUMP_FUN_INITIAL_BLOCK_NUMBER')
                if(!blockNumber) {
                    this.logger.error('[PUMP_FUN_INITIAL_BLOCK_NUMBER] is empty but required, exit')
                    process.exit(1)
                }
                await this.dataSource.manager.insert(IndexerState, {
                    blockNumber
                })
                this.logger.log(`Set initial blockNumber=${blockNumber}`)
            }

            const bootstrapUsers = [
              '0x98f0c3d42b8dafb1f73d8f105344c6a4434a0109',
              '0x2AB4eF5E937CcC03a9c0eAfC7C00836774B149E0'
            ]
            for(const userAddress of bootstrapUsers) {
                if(!(await this.userService.getUserByAddress(userAddress))) {
                    await this.userService.addNewUser({ address: userAddress })
                }
            }
        } catch (e) {
            this.logger.error(`Failed to bootstrap, exit`, e)
            process.exit(1)
        }
    }

    private async processTradeEvents(events: TradeEventLog[]) {
        for(const event of events) {
            const { data, type } = event
            const txnHash = data.transactionHash.toLowerCase()
            const blockNumber = Number(data.blockNumber)
            const values = data.returnValues
            const tokenAddress = (values['token'] as string).toLowerCase()
            const amountIn = String(values['amount0In'] as bigint)
            const amountOut = String(values['amount0Out'] as bigint)
            const fee = String(values['fee'] as bigint)
            const timestamp = Number(values['timestamp'] as bigint)

            const txn = await this.web3.eth.getTransaction(txnHash)
            const userAddress = txn.from.toLowerCase()

            const token = await this.getTokenByAddress(tokenAddress)
            if(!token) {
                this.logger.error(`Trade event: failed to get token by address="${tokenAddress}", event tx hash="${data.transactionHash}", exit`)
                process.exit(1)
            }

            try {
                await this.dataSource.manager.insert(Trade, {
                    type,
                    txnHash,
                    blockNumber,
                    userAddress,
                    token,
                    amountIn,
                    amountOut,
                    fee,
                    timestamp
                });
                this.logger.log(`Trade [${type}]: userAddress=${userAddress}, token=${tokenAddress}, amountIn=${amountIn}, amountOut=${amountOut}, fee=${fee}, timestamp=${timestamp}, txnHash=${txnHash}`)
            } catch (e) {
                this.logger.error(`Failed to process trade [${type}]: userAddress=${userAddress}, token=${tokenAddress} txnHash=${txnHash}`, e)
                throw new Error(e);
            }
        }
    }

    private async getLatestIndexedBlockNumber() {
        const indexerState = await this.dataSource.manager.findOne(IndexerState, {
            where: {},
        })
        if(indexerState) {
            return indexerState.blockNumber
        }
        return 0
    }

    private async updateLastIndexerBlockNumber(blockNumber: number) {
        const stateRepository = this.dataSource.manager.getRepository(IndexerState)
        const indexerState = await stateRepository.findOne({
            where: {}
        })
        indexerState.blockNumber = blockNumber
        await stateRepository.save(indexerState)
    }

    async eventsTrackingLoop() {
        const lastIndexedBlockNumber = await this.getLatestIndexedBlockNumber()
        const fromBlockParam = lastIndexedBlockNumber + 1

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
                      this.web3.utils.sha3('TokenCreated(address,string,string,string,address,uint256)'),
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

                const tradeEvents: TradeEventLog[] = [...buyEvents].map(data => {
                    return {
                        type: TradeType.buy,
                        data
                    }
                }).concat([...sellEvents].map(data => {
                    return {
                        type: TradeType.sell,
                        data
                    }
                })).sort((a, b) => {
                    return +(a.data.returnValues.timestamp.toString()) - +(b.data.returnValues.timestamp.toString())
                })

                for(const tokenCreated of tokenCreatedEvents) {
                    const txnHash = tokenCreated.transactionHash.toLowerCase()
                    const values = tokenCreated.returnValues
                    const tokenAddress = (values['token'] as string).toLowerCase()
                    const name = values['name'] as string
                    const symbol = values['symbol'] as string
                    const uri = values['uri'] as string
                    const creatorAddress = (values['creator'] as string).toLowerCase()
                    const timestamp = Number(values['timestamp'] as bigint)

                    let uriData = null
                    try {
                        const { data } = await axios.get<TokenMetadata>(uri)
                        uriData = data
                    } catch (e) {
                        this.logger.error(`Failed to get token uri data, uri=${uri}, tokenAddress=${tokenAddress}`, e)
                    }

                    const user = await this.dataSource.manager.findOne(UserAccount, {
                        where: {
                            address: creatorAddress
                        }
                    })

                    await this.dataSource.manager.insert(Token, {
                        txnHash,
                        address: tokenAddress,
                        blockNumber: Number(tokenCreated.blockNumber),
                        name,
                        symbol,
                        timestamp,
                        user,
                        uri,
                        uriData,
                    });
                    this.logger.log(`Create token: address=${tokenAddress}, name=${name}, symbol=${symbol}, uri=${uri}, creator=${creatorAddress}, txnHash=${txnHash}`);
                }

                await this.processTradeEvents(tradeEvents)

                this.logger.log(`[${fromBlock}-${toBlock}] (${((toBlock - fromBlock + 1))} blocks), new tokens=${tokenCreatedEvents.length}, trade=${[...buyEvents, ...sellEvents].length} (buy=${buyEvents.length}, sell=${sellEvents.length})`)
            } else {
                // Wait for blockchain
                toBlock = fromBlockParam - 1
                await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            }
        } catch (e) {
            toBlock = fromBlockParam - 1
            this.logger.error(`[${fromBlock} - ${toBlock}] Failed to index blocks range:`, e)
            await new Promise(resolve => setTimeout(resolve, 30 * 1000));
        }

        try {
            await this.updateLastIndexerBlockNumber(toBlock)
        } catch (e) {
            this.logger.error(`Failed to update last blockNumber=${toBlock}, exit`, e)
            process.exit(1)
        }

        this.eventsTrackingLoop()
    }

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
