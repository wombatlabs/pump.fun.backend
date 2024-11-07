import {Injectable, Logger} from '@nestjs/common';
import {Contract, ContractAbi, EventLog, Web3} from "web3";
import {TokenMetadata, TradeEventLog, TradeType} from "../types";
import axios from "axios";
import process from "process";
import {IndexerState, Token, TokenBalance, Trade} from "../entities";
import {ConfigService} from "@nestjs/config";
import {UserService} from "../user/user.service";
import {DataSource} from "typeorm";
import * as TokenFactoryABI from "../abi/TokenFactory.json";
import {AppService} from "../app.service";

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly web3: Web3
  private readonly tokenFactoryContract: Contract<ContractAbi>
  private readonly tokenContract: Contract<ContractAbi>
  private readonly blocksIndexingRange = 1000

  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private appService: AppService,
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
    } catch (e) {
      this.logger.error(`Failed to bootstrap, exit`, e)
      process.exit(1)
    }
  }

  private async processTradeEvents(events: TradeEventLog[]) {
    for(const event of events) {
      const { type, data } = event
      const txnHash = data.transactionHash.toLowerCase()
      const blockNumber = Number(data.blockNumber)
      const values = data.returnValues
      const tokenAddress = (values['token'] as string).toLowerCase()
      const amountIn = values['amount0In'] as bigint
      const amountOut = values['amount0Out'] as bigint
      const fee = String(values['fee'] as bigint)
      const timestamp = Number(values['timestamp'] as bigint)

      const txn = await this.web3.eth.getTransaction(txnHash)
      const userAddress = txn.from.toLowerCase()
      let user = await this.userService.getUserByAddress(userAddress)
      if(!user) {
        this.logger.warn(`Trade event: failed to get user by address="${userAddress}". Creating new user...`)
        await this.userService.addNewUser({ address: userAddress })
        user = await this.userService.getUserByAddress(userAddress)
        if(!user) {
          this.logger.error(`Failed to create user by address: ${userAddress}:`)
          process.exit(1)
        }
      }

      const token = await this.appService.getTokenByAddress(tokenAddress)
      if(!token) {
        this.logger.error(`Trade event: failed to get token by address="${tokenAddress}", event tx hash="${data.transactionHash}", exit`)
        process.exit(1)
      }

      const tokenRepository = this.dataSource.manager.getRepository(Token)
      const tokenHoldersRepository = this.dataSource.manager.getRepository(TokenBalance)

      if(type === 'buy') {
        try {
          let holder = await this.appService.getTokenHolder(tokenAddress, userAddress)
          if(!holder) {
            await this.appService.createTokenHolder(token, user)
            holder = await this.appService.getTokenHolder(tokenAddress, userAddress)
          }
          holder.balance = String(BigInt(holder.balance) + amountOut)
          await tokenHoldersRepository.save(holder)

          token.totalSupply = String(BigInt(token.totalSupply) + amountOut)
          await tokenRepository.save(token)

          this.logger.log(`Updated token balance [${type}]: userAddress=${userAddress}, balance=${holder.balance}, token total supply=${token.totalSupply}`)
        } catch (e) {
          this.logger.error(`Failed to process token holder balance [${type}]: tokenAddress=${tokenAddress}, userAddress=${userAddress}`, e)
          throw new Error(e);
        }
      } else {
        try {
          let holder = await this.appService.getTokenHolder(tokenAddress, userAddress)
          if(!holder) {
            this.logger.log(`Failed to find token holder, exit`)
            process.exit(1)
          }
          holder.balance = String(BigInt(holder.balance) - amountIn)
          await tokenHoldersRepository.save(holder)

          token.totalSupply = String(BigInt(token.totalSupply) - amountIn)
          await tokenRepository.save(token)

          this.logger.log(`Updated token balance [${type}]: userAddress=${userAddress}, balance=${holder.balance}, token total supply=${token.totalSupply}`)
        } catch (e) {
          this.logger.error(`Failed to process token holder balance [${type}]: tokenAddress=${tokenAddress}, userAddress=${userAddress}`, e)
          throw new Error(e);
        }
      }

      try {
        await this.dataSource.manager.insert(Trade, {
          type,
          txnHash,
          blockNumber,
          user,
          token,
          amountIn: String(amountIn),
          amountOut: String(amountOut),
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

          let user = await this.userService.getUserByAddress(creatorAddress)
          if(!user) {
            this.logger.warn(`Creator address=${creatorAddress} is missing,, adding new user...`)
            await this.userService.addNewUser({ address: creatorAddress })
            user = await this.userService.getUserByAddress(creatorAddress)
            if(!user) {
              this.logger.error(`Failed to create user=${creatorAddress}, exit`)
              process.exit(1)
            }
          }

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
}
