import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Contract, ContractAbi, EventLog, Web3} from "web3";
import * as PumpFunABI from '../abi/PumpFunABI.json'
import {DataSource, Between} from "typeorm";
import {Token} from "./entities";
import {AddCommentDto, GetCommentsDto} from "./dto/comment.dto";
import {Comment} from "./entities/comment.entity";
import {GetTokensDto} from "./dto/token.dto";
import * as process from "node:process";
import {Swap} from "./entities/swap.entity";
import {GetSwapsDto} from "./dto/swap.dto";
import {Cron, CronExpression} from "@nestjs/schedule";
import * as moment from "moment";

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly web3: Web3
    private readonly pumpFunContract: Contract<ContractAbi>
    private readonly blocksIndexingRange = 1000
    constructor(
      private configService: ConfigService,
      private dataSource: DataSource,
    ) {
        const rpcUrl = configService.get('RPC_URL')
        const contractAddress = configService.get('PUMP_FUN_CONTRACT_ADDRESS')
        const initialBlockNumber = configService.get('PUMP_FUN_INITIAL_BLOCK_NUMBER')

        this.logger.log(`Starting app service, RPC_URL=${
            rpcUrl
        }, PUMP_FUN_CONTRACT_ADDRESS=${
            contractAddress
        }, PUMP_FUN_INITIAL_BLOCK_NUMBER=${
            initialBlockNumber
        }`)

        this.web3 = new Web3(rpcUrl);
        this.pumpFunContract = new this.web3.eth.Contract(PumpFunABI, contractAddress);
        this.eventsTrackingLoop()
        this.logger.log(`App service started`)
    }

    private async getLatestIndexedBlockNumber() {
        const lastToken = await this.dataSource.manager.findOne(Token, {
            where: {},
            order: {
                createdAt: 'desc'
            }
        })
        const lastSwap = await this.dataSource.manager.findOne(Swap, {
            where: {},
            order: {
                createdAt: 'desc'
            }
        })
        if(lastToken || lastSwap) {
           return Math.max(+lastToken?.blockNumber || 0, +lastSwap?.blockNumber || 0)
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
                const newTokenEvents = await this.pumpFunContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [
                      this.web3.utils.sha3('Launched(address,address,uint256)'),
                    ],
                }) as EventLog[];

                const swapEvents = await this.pumpFunContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [
                        this.web3.utils.sha3('SwapETHForTokens(address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)'),
                    ],
                }) as EventLog[];

                for(const event of newTokenEvents) {
                    const txnHash = event.transactionHash
                    const values = event.returnValues
                    const tokenAddress = values['token'] as string
                    const pairAddress = values['pair'] as string
                    const amount = (values['2'] as bigint).toString() // TODO: add param name in the contract

                    await this.dataSource.manager.insert(Token, {
                        txnHash,
                        address: tokenAddress,
                        pairAddress,
                        amount,
                        blockNumber: String(event.blockNumber)
                    });
                    this.logger.log(`Added new token: address=${tokenAddress}, pair=${pairAddress}, amount=${amount}, txnHash=${txnHash}`)
                }

                for(const event of swapEvents) {
                    const txnHash = event.transactionHash
                    const blockNumber = event.blockNumber.toString()
                    const values = event.returnValues
                    const tokenAddress = values['token'] as string
                    const pairAddress = values['pair'] as string
                    const amountIn = values['amount0In'] as string
                    const amountOut = values['amount0Out'] as string
                    const prevPrice = values['prevPrice'] as string
                    const price = values['price'] as string
                    const mCap = values['mCap'] as string
                    const liquidity = values['liquidity'] as string
                    const volume = values['volume'] as string
                    const volume24H = values['volume24H'] as string

                    const token = await this.getTokenByAddress(tokenAddress)
                    if(!token) {
                        this.logger.error(`swap event: failed to get token by address="${tokenAddress}", event tx hash="${event.transactionHash}", exit`)
                        process.exit(1)
                    }

                    try {
                        await this.dataSource.manager.insert(Swap, {
                            txnHash,
                            blockNumber,
                            token,
                            amountIn,
                            amountOut,
                            prevPrice,
                            price,
                            mCap,
                            liquidity,
                            volume,
                            volume24H
                        });
                        this.logger.log(`Swap: token=${tokenAddress}, amountIn=${amountIn}, mCap=${mCap}, liquidity=${liquidity}, volume=${volume}, volume24H=${volume24H}`)
                    } catch (e) {
                        this.logger.error(`Failed to process swap token=${tokenAddress} txnHash=${txnHash}`, e)
                        throw new Error(e);
                    }
                }
                this.logger.log(`[${fromBlock} - ${toBlock}] (${((toBlock - fromBlock + 1))} blocks), new tokens: ${newTokenEvents.length}, swaps: ${swapEvents.length}`)
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

    async getSwaps(dto: GetSwapsDto){
        return await this.dataSource.manager.find(Swap, {
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
    @Cron(CronExpression.EVERY_5_SECONDS)
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
            const tokenSwaps = await this.dataSource.manager.find(Swap, {
                where: {
                    token: {
                        id: token.id
                    },
                    createdAt: Between(dateStart.toDate(), dateEnd.toDate())
                }
            })
            const totalAmount = tokenSwaps.reduce((acc, item) => acc += BigInt(item.volume), 0n)
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
