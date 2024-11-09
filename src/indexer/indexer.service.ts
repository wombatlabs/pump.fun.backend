import {Injectable, Logger} from '@nestjs/common';
import {Contract, ContractAbi, EventLog, Web3} from "web3";
import {TokenMetadata, TradeType} from "../types";
import axios from "axios";
import process from "process";
import {IndexerState, Token, TokenBalance, TokenWinner, Trade} from "../entities";
import {ConfigService} from "@nestjs/config";
import {UserService} from "../user/user.service";
import {DataSource, EntityManager} from "typeorm";
import * as TokenFactoryABI from "../abi/TokenFactory.json";
import {AppService} from "../app.service";
import {Cron, CronExpression} from "@nestjs/schedule";
import {ZeroAddress} from "ethers";
import Decimal from "decimal.js";

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly web3: Web3
  private readonly accountAddress: string
  private readonly tokenFactoryContract: Contract<ContractAbi>
  private readonly blocksIndexingRange = 1000

  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private appService: AppService,
    private dataSource: DataSource,
  ) {
    const rpcUrl = configService.get('RPC_URL')
    const contractAddress = configService.get('TOKEN_FACTORY_ADDRESS')
    const initialBlockNumber = configService.get('INDEXER_INITIAL_BLOCK_NUMBER')

    if(!contractAddress) {
      this.logger.error(`[TOKEN_FACTORY_ADDRESS] is missing but required, exit`)
      process.exit(1)
    }

    if(!initialBlockNumber) {
      this.logger.error(`[INDEXER_INITIAL_BLOCK_NUMBER] is missing but required, exit`)
      process.exit(1)
    }

    this.logger.log(`Starting app service, RPC_URL=${
      rpcUrl
    }, TOKEN_FACTORY_ADDRESS=${
      contractAddress
    }, INDEXER_INITIAL_BLOCK_NUMBER=${
      initialBlockNumber
    }`)

    this.web3 = new Web3(rpcUrl);
    const account = this.web3.eth.accounts.privateKeyToAccount(configService.get('SERVICE_PRIVATE_KEY'))
    this.accountAddress = account.address
    this.web3.eth.accounts.wallet.add(account);
    this.logger.log(`Service account address=${account.address}`)
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
        const blockNumber = +this.configService.get<number>('INDEXER_INITIAL_BLOCK_NUMBER')
        if(!blockNumber) {
          this.logger.error('[INDEXER_INITIAL_BLOCK_NUMBER] is empty but required, exit')
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

  private async processSetWinnerEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const txnHash = event.transactionHash.toLowerCase()
    const blockNumber = Number(event.blockNumber)
    const values = event.returnValues
    const winnerAddress = (values['winner'] as string).toLowerCase()
    const timestamp = String(values['timestamp'] as bigint)

    if(winnerAddress === ZeroAddress) {
      this.logger.warn(`winnerAddress=${winnerAddress}, txnHash=${txnHash}, skip`)
      return
    }

    const existedWinner = await transactionalEntityManager.findOne(TokenWinner, {
      where: {
        token: {
          address: winnerAddress
        },
        timestamp
      }
    })

    if(!existedWinner) {
      const token = await this.appService.getTokenByAddress(winnerAddress, transactionalEntityManager)
      if(!token) {
        this.logger.error(`Winner token entry not found in database, winnerAddress=${winnerAddress} , exit`)
        process.exit(1)
      }
      await transactionalEntityManager.insert(TokenWinner, {
        token,
        timestamp,
        txnHash,
        blockNumber
      })
      this.logger.log(`Added new token winner=${winnerAddress}, timestamp=${timestamp}`)
    } else {
      this.logger.warn(`Token winner=${winnerAddress}, timestamp=${timestamp} already exists, skip`)
    }
  }

  private async processCreateTokenEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const txnHash = event.transactionHash.toLowerCase()
    const values = event.returnValues
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

    let user = await this.userService.getUserByAddress(creatorAddress, transactionalEntityManager)
    if(!user) {
      this.logger.warn(`Creator address=${creatorAddress} is missing,, adding new user...`)
      await this.userService.addNewUser({ address: creatorAddress }, transactionalEntityManager)
      user = await this.userService.getUserByAddress(creatorAddress, transactionalEntityManager)
      if(!user) {
        this.logger.error(`Failed to create user=${creatorAddress}, exit`)
        process.exit(1)
      }
    }

    await transactionalEntityManager.insert(Token, {
      txnHash,
      address: tokenAddress,
      blockNumber: Number(event.blockNumber),
      name,
      symbol,
      timestamp,
      user,
      uri,
      uriData,
    });
    this.logger.log(`Create token: address=${tokenAddress}, name=${name}, symbol=${symbol}, uri=${uri}, creator=${creatorAddress}, txnHash=${txnHash}`);
  }

  private async processTradeEvent(type: TradeType, event: EventLog, transactionalEntityManager: EntityManager) {
    const txnHash = event.transactionHash.toLowerCase()
    const blockNumber = Number(event.blockNumber)
    const values = event.returnValues
    const tokenAddress = (values['token'] as string).toLowerCase()
    const amountIn = values['amount0In'] as bigint
    const amountOut = values['amount0Out'] as bigint
    const fee = String(values['fee'] as bigint)
    const timestamp = Number(values['timestamp'] as bigint)

    const txn = await this.web3.eth.getTransaction(txnHash)
    const userAddress = txn.from.toLowerCase()
    let user = await this.userService.getUserByAddress(userAddress, transactionalEntityManager)
    if(!user) {
      this.logger.warn(`Trade event: failed to get user by address="${userAddress}". Creating new user...`)
      await this.userService.addNewUser({ address: userAddress }, transactionalEntityManager)
      user = await this.userService.getUserByAddress(userAddress, transactionalEntityManager)
      if(!user) {
        this.logger.error(`Failed to create user by address: ${userAddress}:`)
        process.exit(1)
      }
    }

    const token = await this.appService.getTokenByAddress(tokenAddress, transactionalEntityManager)
    if(!token) {
      this.logger.error(`Trade event: failed to get token by address="${tokenAddress}", event tx hash="${event.transactionHash}", exit`)
      process.exit(1)
    }

    const tokenRepository = transactionalEntityManager.getRepository(Token)
    const tokenHoldersRepository = transactionalEntityManager.getRepository(TokenBalance)

    if(type === 'buy') {
      try {
        let holder = await this.appService.getTokenHolder(tokenAddress, userAddress, transactionalEntityManager)
        if(!holder) {
          await this.appService.createTokenHolder(token, user, transactionalEntityManager)
          holder = await this.appService.getTokenHolder(tokenAddress, userAddress, transactionalEntityManager)
        }
        holder.balance = String(BigInt(holder.balance) + amountOut)
        await tokenHoldersRepository.save(holder)

        token.totalSupply = String(BigInt(token.totalSupply) + amountOut)
        token.price = (new Decimal(amountIn.toString()).div(10).div(new Decimal(amountOut.toString()))).toFixed(10)
        await tokenRepository.save(token)

        this.logger.log(`Updated token balance [${type}]: userAddress=${userAddress}, balance=${holder.balance}, token total supply=${token.totalSupply}, token price: ${token.price}`)
      } catch (e) {
        this.logger.error(`Failed to process token holder balance [${type}]: tokenAddress=${tokenAddress}, userAddress=${userAddress}`, e)
        throw new Error(e);
      }
    } else {
      try {
        let holder = await this.appService.getTokenHolder(tokenAddress, userAddress, transactionalEntityManager)
        if(!holder) {
          this.logger.log(`Failed to find token holder, exit`)
          process.exit(1)
        }
        holder.balance = String(BigInt(holder.balance) - amountIn)
        await tokenHoldersRepository.save(holder)

        token.totalSupply = String(BigInt(token.totalSupply) - amountIn)
        token.price = (new Decimal(amountOut.toString()).div(10).div(new Decimal(amountIn.toString()))).toFixed(10)
        await tokenRepository.save(token)
        this.logger.log(`Updated token balance [${type}]: userAddress=${userAddress}, balance=${holder.balance}, token total supply=${token.totalSupply}, token price=${token.price}`)
      } catch (e) {
        this.logger.error(`Failed to process token holder balance [${type}]: tokenAddress=${tokenAddress}, userAddress=${userAddress}`, e)
        throw new Error(e);
      }
    }

    try {
      await transactionalEntityManager.insert(Trade, {
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
        const setWinnerEvents = await this.tokenFactoryContract.getPastEvents('allEvents', {
          fromBlock, toBlock, topics: [ this.web3.utils.sha3('SetWinner(address,uint256)')],
        }) as EventLog[];

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

        // concat and sort all events by block number and transaction index
        const protocolEvents: { data: EventLog; type: string }[] = tokenCreatedEvents
          .map(data => ({ type: 'create_token', data }))
          .concat(...buyEvents.map(data => ({ type: 'buy', data })))
          .concat(...sellEvents.map(data => ({ type: 'sell', data })))
          .concat(...setWinnerEvents.map(data => ({ type: 'set_winner', data })))
          .sort((a, b) => {
            const blockNumberDiff = Number(a.data.blockNumber) - Number(b.data.blockNumber)
            if(blockNumberDiff !== 0) {
              return blockNumberDiff
            }
            return Number(a.data.transactionIndex) - Number(b.data.transactionIndex)
          })

        await this.dataSource.manager.transaction(async (transactionalEntityManager) => {
          for(const protocolEvent of protocolEvents) {
            const { type, data } = protocolEvent
            switch (type) {
              case 'create_token': {
                await this.processCreateTokenEvent(data, transactionalEntityManager)
                break;
              }
              case 'buy': {
                await this.processTradeEvent(TradeType.buy, data, transactionalEntityManager)
                break;
              }
              case 'sell': {
                await this.processTradeEvent(TradeType.sell, data, transactionalEntityManager)
                break;
              }
              case 'set_winner': {
                await this.processSetWinnerEvent(data, transactionalEntityManager)
                break;
              }
            }
          }
        })

        this.logger.log(`[${fromBlock}-${toBlock}] (${((toBlock - fromBlock + 1))} blocks), new tokens=${tokenCreatedEvents.length}, trade=${[...buyEvents, ...sellEvents].length} (buy=${buyEvents.length}, sell=${sellEvents.length}), setWinner=${setWinnerEvents.length}`)
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

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async callSetWinner() {
    let txnHash = ''
    let gasFees = 0n

    for(let i = 0; i < 3; i++) {
      try {
        gasFees = await this.tokenFactoryContract.methods
          .setWinner()
          .estimateGas({ from: this.accountAddress });
        const gasPrice = await this.web3.eth.getGasPrice();
        const tx = {
          from: this.accountAddress,
          to: this.configService.get('TOKEN_FACTORY_ADDRESS'),
          gas: gasFees,
          gasPrice,
          data: this.tokenFactoryContract.methods.setWinner().encodeABI(),
        };
        const signPromise = await this.web3.eth.accounts.signTransaction(tx, this.configService.get('SERVICE_PRIVATE_KEY'));
        const sendTxn =
          await this.web3.eth.sendSignedTransaction(
            signPromise.rawTransaction,
          );
        txnHash = sendTxn.transactionHash.toString()
        break;
      } catch (e) {
        this.logger.warn(`Failed to send setWinner transaction, attempt: ${(i + 1)} / 3:`, e)
      }
    }

    if(txnHash) {
      this.logger.log(`[setWinner] successfully called, transaction hash=${txnHash}, gasFees=${gasFees}`)
    } else {
      this.logger.error('Failed to call setWinner!')
    }
  }
}
