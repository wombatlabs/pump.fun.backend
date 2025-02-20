import {Injectable, Logger} from '@nestjs/common';
import {EventLog, Web3} from "web3";
import {TokenFactoryConfig, TokenMetadata, TradeType} from "../types";
import axios from "axios";
import * as process from "process";
import {
  CompetitionEntity,
  IndexerState,
  LiquidityProvision,
  Token,
  TokenBalance,
  TokenBurn,
  Trade
} from "../entities";
import {ConfigService} from "@nestjs/config";
import {UserService} from "../user/user.service";
import {DataSource, EntityManager} from "typeorm";
import * as TokenFactoryABI from "../abi/TokenFactory.json";
import * as TokenFactoryBaseABI from "../abi/TokenFactoryBase.json";
import {AppService} from "../app.service";
import {parseUnits, ZeroAddress} from "ethers";
import Decimal from "decimal.js";
import {Cron, CronExpression, SchedulerRegistry} from "@nestjs/schedule";
import * as moment from "moment-timezone";
import {Moment} from "moment";
import {getRandomNumberFromInterval} from "../utils";

const CompetitionScheduleCheckJob = 'competition_check_job';
const BaseCollateralCheckJob = 'base_collateral_check_job';

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly web3: Web3
  private readonly accountAddress: string
  private readonly maxBlocksRange = 1000
  private readonly maxBlocksBatchSize = 20

  constructor(
    private configService: ConfigService,
    private userService: UserService,
    private appService: AppService,
    private dataSource: DataSource,
    private schedulerRegistry: SchedulerRegistry
  ) {
    const rpcUrl = configService.get('RPC_URL')
    const tokenFactoryParams = configService.get('TOKEN_FACTORY')
    const privateKey = configService.get('SERVICE_PRIVATE_KEY')

    if(!tokenFactoryParams) {
      this.logger.error(`[TOKEN_FACTORY] is missing but required, exit`)
      process.exit(1)
    }

    if(!privateKey) {
      this.logger.error(`[SERVICE_PRIVATE_KEY] is missing but required, exit`)
      process.exit(1)
    }

    this.logger.log(`Starting app service, RPC_URL=${
      rpcUrl
    }, TOKEN_FACTORY=${
      tokenFactoryParams
    }`)

    this.web3 = new Web3(rpcUrl);
    const account = this.web3.eth.accounts.privateKeyToAccount(privateKey)
    this.accountAddress = account.address
    this.web3.eth.accounts.wallet.add(account);
    this.logger.log(`Service account address=${account.address}`)
    this.bootstrap().then(
      (tokenFactories) => {
        this.eventsTrackingLoop(tokenFactories)
        // this.initiateNewCompetition('')
      }
    )
    this.logger.log(`App service started`)
  }

  private getTokenFactories(): TokenFactoryConfig[] {
    const values = this.configService.get<string>('TOKEN_FACTORY')
    const factoryConfigs = values.split(';')
    return factoryConfigs.map(item => {
      const [address, blockNumber] = item.split(',')
      return {
        address,
        blockNumber: Number(blockNumber)
      }
    })
  }

  private async bootstrap() {
    try {
      const tokenFactories = this.getTokenFactories()

      for(const tokenFactory of tokenFactories) {
        const { address, blockNumber } = tokenFactory
        const indexerState = await this.dataSource.manager.findOne(IndexerState, {
          where: {
            name: address
          }
        })

        if(!indexerState) {
          await this.dataSource.manager.insert(IndexerState, {
            name: address,
            blockNumber
          })
          this.logger.log(`Bootstrap: created new tokenFactory=${address}, blockNumber=${blockNumber}`)
        } else {
          this.logger.log(`Bootstrap: existed tokenFactory=${indexerState.name}, blockNumber=${indexerState.blockNumber}`)
        }

        try {
          // create initial competition id = 1
          const contract = new this.web3.eth.Contract(TokenFactoryABI, address);
          const currentCompetitionId = await contract.methods
            .currentCompetitionId()
            .call() as bigint

          const [lastCompetition] = await this.appService.getCompetitions({
            competitionId: Number(currentCompetitionId),
            limit: 1
          })
          if(!lastCompetition && currentCompetitionId > 0) {
            const initialCompetitionId = 1
            const block = await this.web3.eth.getBlock(blockNumber)
            await this.dataSource.manager.insert(CompetitionEntity, {
              txnHash: '',
              blockNumber: blockNumber,
              tokenFactoryAddress: address.toLowerCase(),
              competitionId: initialCompetitionId,
              timestampStart: Number(block.timestamp),
              timestampEnd: null,
              isCompleted: false,
              winnerToken: null,
            });
            this.logger.log(`INITIAL NewCompetitionStarted: competitionId=${initialCompetitionId}, timestamp=${Number(block.timestamp)}`);
          }
        } catch (e) {

        }
      }

      return tokenFactories
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
    const competitionId = Number(values['competitionId'] as bigint)
    const timestamp = Number(values['timestamp'] as bigint)

    if(winnerAddress === ZeroAddress) {
      this.logger.warn(`winnerAddress=${winnerAddress}, txnHash=${txnHash}, skip`)
      return
    }

    const token = await this.appService.getTokenByAddress(winnerAddress, transactionalEntityManager)
    if(!token) {
      this.logger.error(`Failed to add winner: winner token not found in database, winnerAddress=${winnerAddress}, exit`)
      process.exit(1)
    }

    const [competition] = await this.appService.getCompetitions({
      competitionId
    }, transactionalEntityManager)

    if(!competition) {
      this.logger.error(`Failed to add winner: competition=${competitionId} not found in database, exit`)
      process.exit(1)
    }

    token.isWinner = true
    await transactionalEntityManager.save(token)

    competition.winnerToken = token
    await transactionalEntityManager.save(competition)

    this.logger.log(`Added new token winner=${winnerAddress}, competitionId=${competitionId}, txnHash=${txnHash}, timestamp=${timestamp}`)
  }

  private async processCreateTokenEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const tokenFactoryAddress = event.address.toLowerCase()
    const txnHash = event.transactionHash.toLowerCase()
    const values = event.returnValues
    const tokenAddress = (values['token'] as string).toLowerCase()
    const name = values['name'] as string
    const symbol = values['symbol'] as string
    const uri = values['uri'] as string
    const creatorAddress = (values['creator'] as string).toLowerCase()
    const competitionId = values['competitionId'] ? Number(values['competitionId'] as bigint) : -1
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
      this.logger.warn(`Creator address=${creatorAddress} is missing, adding new user...`)
      await this.userService.createUser({ address: creatorAddress }, transactionalEntityManager)
      user = await this.userService.getUserByAddress(creatorAddress, transactionalEntityManager)
      if(!user) {
        this.logger.error(`Failed to create user=${creatorAddress}, exit`)
        process.exit(1)
      }
    }

    const competition = await transactionalEntityManager.findOne(CompetitionEntity, {
      where: {
        tokenFactoryAddress
      },
      order: {
        competitionId: 'DESC'
      }
    })
    // if(!competition) {
    //   this.logger.error(`Create token: current competition is missing in DB; exit`)
    //   process.exit(1)
    // }
    if(competition && competition.isCompleted) {
      this.logger.error(`Create token: current competition is completed, new competitions has not started yet; exit`)
      process.exit(1)
    }

    await transactionalEntityManager.insert(Token, {
      txnHash,
      address: tokenAddress,
      blockNumber: Number(event.blockNumber),
      tokenFactoryAddress,
      name,
      symbol,
      timestamp,
      user,
      uri,
      uriData,
      competition
    });
    this.logger.log(`Create token: address=${tokenAddress}, name=${name}, symbol=${symbol}, uri=${uri}, creator=${creatorAddress}, competitionId=${competitionId}, txnHash=${txnHash}`);
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
      await this.userService.createUser({ address: userAddress }, transactionalEntityManager)
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

    let price = '0'
    if(type === 'buy') {
      try {
        let holder = await this.appService.getTokenHolder(tokenAddress, userAddress, transactionalEntityManager)
        if(!holder) {
          await this.appService.createTokenHolder(token, user, transactionalEntityManager)
          holder = await this.appService.getTokenHolder(tokenAddress, userAddress, transactionalEntityManager)
        }
        holder.balance = String(BigInt(holder.balance) + amountOut)
        await tokenHoldersRepository.save(holder)

        const priceDecimal = new Decimal(amountIn.toString()).div(new Decimal(amountOut.toString()))
        const totalSupplyDecimal = new Decimal(token.totalSupply)
          .add(new Decimal(String(amountOut)))
        const marketCapDecimal = priceDecimal.mul(totalSupplyDecimal.div(10 ** 18))
        price = priceDecimal.toFixed(10)
        token.totalSupply = totalSupplyDecimal.toString()
        token.price = price
        token.marketCap = marketCapDecimal.toFixed(10)

        await tokenRepository.save(token)
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

        const priceDecimal = new Decimal(amountOut.toString()).div(new Decimal(amountIn.toString()))
        const totalSupplyDecimal = new Decimal(token.totalSupply)
          .sub(new Decimal(String(amountIn)))
        const marketCapDecimal = priceDecimal.mul(totalSupplyDecimal.div(10 ** 18))

        price = priceDecimal.toFixed(10)
        token.totalSupply = totalSupplyDecimal.toString()
        token.price = price
        token.marketCap = marketCapDecimal.toFixed(10)

        if(marketCapDecimal.lt(0)) {
          this.logger.error(`Failed to index block=${blockNumber}: market cap < 0 (${marketCapDecimal.toFixed()}), token=${tokenAddress}, txnHash=${txnHash}, transactionIndex=${event.transactionIndex}, logIndex=${event.logIndex}`)
          process.exit(1)
        }

        await tokenRepository.save(token)
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
        price,
        fee,
        timestamp
      });
      this.logger.log(`[${
        blockNumber
      }] trade [${
        type
      }] userAddress=${
        userAddress
      }, token=${tokenAddress}, amountIn=${amountIn}, amountOut=${amountOut}, fee=${fee}, timestamp=${timestamp}, txnHash=${txnHash}, token total supply=${token.totalSupply}, token price=${token.price}, marketCap=${token.marketCap}`)
    } catch (e) {
      this.logger.error(`Failed to process trade [${type}]: userAddress=${userAddress}, token=${tokenAddress} txnHash=${txnHash}`, e)
      throw new Error(e);
    }
  }

  private async processBurnTokenAndSetWinnerEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const txnHash = event.transactionHash.toLowerCase()
    const values = event.returnValues
    const senderAddress = (values['sender'] as string).toLowerCase()
    const tokenAddress = (values['token'] as string).toLowerCase()
    const winnerTokenAddress = (values['winnerToken'] as string).toLowerCase()
    const burnedAmount = values['burnedAmount'] as bigint
    const fee = values['fee'] as bigint
    const mintedAmount = values['mintedAmount'] as bigint
    const timestamp = Number(values['timestamp'] as bigint)

    let sender = await this.userService.getUserByAddress(senderAddress, transactionalEntityManager)
    if(!sender) {
      this.logger.warn(`Sender ${senderAddress} is missing, adding new user...`)
      await this.userService.createUser({ address: senderAddress }, transactionalEntityManager)
      sender = await this.userService.getUserByAddress(senderAddress, transactionalEntityManager)
    }

    const token = await this.appService.getTokenByAddress(tokenAddress, transactionalEntityManager)
    if(!token) {
      this.logger.error(`Token ${tokenAddress} not found in database, exit`)
      process.exit(1)
    }

    const winnerToken = await this.appService.getTokenByAddress(winnerTokenAddress, transactionalEntityManager)
    if(!winnerToken) {
      this.logger.error(`Winner token ${winnerTokenAddress} not found in database, exit`)
      process.exit(1)
    }

    await transactionalEntityManager.insert(TokenBurn, {
      txnHash,
      blockNumber: Number(event.blockNumber),
      sender,
      token,
      winnerToken,
      timestamp,
      burnedAmount: String(burnedAmount),
      fee: String(fee),
      mintedAmount: String(mintedAmount),
    });
    this.logger.log(`BurnTokenAndMintWinner: senderAddress=${senderAddress}, tokenAddress=${tokenAddress}, winnerTokenAddress=${winnerTokenAddress}, burnedAmount=${burnedAmount}, fee=${fee}, mintedAmount=${mintedAmount}, txnHash=${txnHash}`);
  }

  private async processWinnerLiquidityEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const txnHash = event.transactionHash.toLowerCase()
    const values = event.returnValues
    const tokenAddress = (values['tokenAddress'] as string).toLowerCase()
    const tokenCreatorAddress = (values['tokenCreator'] as string).toLowerCase()
    const pool = (values['pool'] as string).toLowerCase()
    const sender = (values['sender'] as string).toLowerCase()
    const tokenId = String(values['tokenId'] as bigint)
    const liquidity = String(values['liquidity'] as bigint)
    const actualTokenAmount = String(values['actualTokenAmount'] as bigint)
    const actualAssetAmount = String(values['actualAssetAmount'] as bigint)
    const timestamp = Number(values['timestamp'] as bigint)

    const token = await this.appService.getTokenByAddress(tokenAddress, transactionalEntityManager)
    if(!token) {
      this.logger.error(`LiquidityProvision txn hash=${txnHash}: token ${tokenAddress} not found in database, exit`)
      process.exit(1)
    }

    let tokenCreator = await this.userService.getUserByAddress(tokenCreatorAddress, transactionalEntityManager)
    if(!tokenCreator) {
      this.logger.warn(`Token creator ${tokenCreatorAddress} is missing, adding new user...`)
      await this.userService.createUser({ address: tokenCreatorAddress }, transactionalEntityManager)
      tokenCreator = await this.userService.getUserByAddress(tokenCreatorAddress, transactionalEntityManager)
    }

    await transactionalEntityManager.insert(LiquidityProvision, {
      txnHash,
      blockNumber: Number(event.blockNumber),
      token,
      tokenCreator,
      pool,
      sender,
      tokenId,
      liquidity,
      actualTokenAmount,
      actualAssetAmount,
      timestamp,
    });
    this.logger.log(`WinnerLiquidityAdded: tokenAddress=${tokenAddress}, tokenCreator=${tokenCreatorAddress}, pool=${pool}, liquidity=${liquidity}, actualTokenAmount=${actualTokenAmount}, actualAssetAmount=${actualAssetAmount}, timestamp=${timestamp}, txnHash=${txnHash}`);
  }

  private async processNewCompetitionEvent(event: EventLog, transactionalEntityManager: EntityManager) {
    const tokenFactoryAddress = event.address.toLowerCase()
    const txnHash = event.transactionHash.toLowerCase()
    const values = event.returnValues
    const competitionId = Number(values['competitionId'] as bigint)
    const timestamp = Number(values['timestamp'] as bigint)

    const prevCompetitionId = competitionId - 1
    const [prevCompetition] = await this.appService.getCompetitions({
      competitionId: prevCompetitionId
    }, transactionalEntityManager)

    if(prevCompetition) {
      prevCompetition.isCompleted = true
      prevCompetition.timestampEnd = timestamp
      await transactionalEntityManager.save(prevCompetition)
      this.logger.log(`Competition completed, competitionId=${prevCompetition.competitionId}`);
    } else {
      if(competitionId > 2) {
        this.logger.error(`Failed to get prev competition=${prevCompetitionId}, new competitionId=${competitionId}, exit`)
        process.exit(1)
      }
    }

    await transactionalEntityManager.insert(CompetitionEntity, {
      txnHash,
      blockNumber: Number(event.blockNumber),
      tokenFactoryAddress,
      competitionId,
      timestampStart: timestamp,
      timestampEnd: null,
      isCompleted: false,
      winnerToken: null,
    });
    this.logger.log(`NewCompetitionStarted: competitionId=${competitionId}, timestamp=${timestamp}, txnHash=${txnHash}`);
  }

  public async getLatestIndexedBlockNumber(indexerName: string) {
    const indexerState = await this.dataSource.manager.findOne(IndexerState, {
      where: {
        name: indexerName
      },
    })

    if(indexerState) {
      return indexerState.blockNumber
    }
    return 0
  }

  private async updateLastIndexerBlockNumber(indexerName: string, blockNumber: number) {
    const stateRepository = this.dataSource.manager.getRepository(IndexerState)
    const indexerState = await stateRepository.findOne({
      where: {
        name: indexerName
      }
    })

    if(!indexerState) {
      throw new Error('Indexer state not found: ' + indexerName)
    }

    indexerState.blockNumber = blockNumber
    await stateRepository.save(indexerState)
  }

  async getEventsFromBlocksRange(
    tokenFactory: TokenFactoryConfig,
    fromBlock: number,
    toBlock: number
  ) {
    const tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, tokenFactory.address);
    const tokenFactoryBaseContract = new this.web3.eth.Contract(TokenFactoryBaseABI, tokenFactory.address);
    const [
      newCompetitionEvents,
      setWinnerEvents,
      winnerLiquidityEvents,
      tokenCreatedEvents,
      buyEvents,
      sellEvents,
      burnAndSetWinnerEvents
    ] = await Promise.all([
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('NewCompetitionStarted(uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('SetWinner(address,uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('WinnerLiquidityAdded(address,address,address,address,uint256,uint128,uint256,uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('TokenCreated(address,string,string,string,address,uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('TokenBuy(address,uint256,uint256,uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [this.web3.utils.sha3('TokenSell(address,uint256,uint256,uint256,uint256)')],
      }),
      tokenFactoryContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [this.web3.utils.sha3('BurnTokenAndMintWinner(address,address,address,uint256,uint256,uint256,uint256)')],
      })
    ]) as EventLog[][]

    const [tokenCreatedBaseEvents] = await Promise.all([
      tokenFactoryBaseContract.getPastEvents('allEvents', {
        fromBlock, toBlock, topics: [ this.web3.utils.sha3('TokenCreated(address,string,string,string,address,uint256)')],
      }),
    ])

    return tokenCreatedEvents
      .map(data => ({ type: 'create_token', data }))
      .concat(...buyEvents.map(data => ({ type: 'buy', data })))
      .concat(...sellEvents.map(data => ({ type: 'sell', data })))
      .concat(...setWinnerEvents.map(data => ({ type: 'set_winner', data })))
      .concat(...burnAndSetWinnerEvents.map(data => ({ type: 'burn_token_and_set_winner', data })))
      .concat(...winnerLiquidityEvents.map(data => ({ type: 'winner_liquidity', data })))
      .concat(...newCompetitionEvents.map(data => ({ type: 'new_competition', data })))
      // @ts-ignore
      .concat(...tokenCreatedBaseEvents.map(data => ({ type: 'create_token_base', data })))
  }

  async eventsTrackingLoop(tokenFactories: TokenFactoryConfig[]) {
    await this.dataSource.manager.transaction(async (transactionalEntityManager) => {
      for(const tokenFactory of tokenFactories) {
        const lastIndexedBlockNumber = await this.getLatestIndexedBlockNumber(tokenFactory.address)
        const fromBlockParam = lastIndexedBlockNumber + 1

        let fromBlock = fromBlockParam
        let toBlock = fromBlock

        try {
          const blockchainBlockNumber = +(String(await this.web3.eth.getBlockNumber()))
          toBlock = fromBlock + this.maxBlocksRange * this.maxBlocksBatchSize - 1
          if(toBlock > blockchainBlockNumber) {
            toBlock = blockchainBlockNumber
          }

          const delta = toBlock - fromBlock
          if(delta >= 1) {
            const numberOfBatches = Math.ceil(delta / this.maxBlocksRange)

            const protocolEventsBatch = await Promise.all(
              new Array(numberOfBatches)
                .fill(null)
                .map(async (_, index) => {
                  const batchFromBlock = fromBlock + index * this.maxBlocksRange
                  const batchToBlock = Math.min(batchFromBlock + this.maxBlocksRange - 1, toBlock)
                  return await this.getEventsFromBlocksRange(tokenFactory, batchFromBlock, batchToBlock)
                })
            )

            const protocolEvents = protocolEventsBatch
              .flat()
              .sort((a, b) => {
                const blockNumberDiff = Number(a.data.blockNumber) - Number(b.data.blockNumber)
                if(blockNumberDiff !== 0) {
                  return blockNumberDiff
                }
                return Number(a.data.transactionIndex) - Number(b.data.transactionIndex)
              })

            for(const protocolEvent of protocolEvents) {
              const { type, data } = protocolEvent
              switch (type) {
                case 'create_token': case 'create_token_base': {
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
                case 'burn_token_and_set_winner': {
                  await this.processBurnTokenAndSetWinnerEvent(data, transactionalEntityManager)
                  break;
                }
                case 'winner_liquidity': {
                  await this.processWinnerLiquidityEvent(data, transactionalEntityManager)
                  break;
                }
                case 'new_competition': {
                  await this.processNewCompetitionEvent(data, transactionalEntityManager)
                  break;
                }
              }
            }

            this.logger.log(`[${tokenFactory.address}] [${fromBlock}-${toBlock}] (${((toBlock - fromBlock + 1))} blocks), events count=${protocolEvents.length}`)
          } else {
            // Wait for blockchain
            toBlock = fromBlockParam - 1
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (e) {
          toBlock = fromBlockParam - 1
          this.logger.error(`[${tokenFactory.address}] [${fromBlock} - ${toBlock}] Failed to index blocks range:`, e)
          await new Promise(resolve => setTimeout(resolve, 30 * 1000));
        }

        try {
          await this.updateLastIndexerBlockNumber(tokenFactory.address, toBlock)
        } catch (e) {
          this.logger.error(`Failed to update last blockNumber=${toBlock}, exit`, e)
          process.exit(1)
        }
      }
    })

    return this.eventsTrackingLoop(tokenFactories)
  }

  private sleep(timeout: number) {
    return new Promise(resolve => setTimeout(resolve, timeout));
  }

  private async setWinnerByCompetitionId(tokenFactoryAddress: string, prevCompetitionId: bigint) {
    const tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, tokenFactoryAddress);
    const gasFees = await tokenFactoryContract.methods
      .setWinnerByCompetitionId(prevCompetitionId)
      .estimateGas({
        from: this.accountAddress
      });

    const gasPrice = await this.web3.eth.getGasPrice();

    const tx = {
      from: this.accountAddress,
      to: tokenFactoryAddress,
      gas: gasFees * 2n,
      gasPrice,
      data: tokenFactoryContract.methods
        .setWinnerByCompetitionId(prevCompetitionId)
        .encodeABI(),
    };

    const signPromise = await this.web3.eth.accounts.signTransaction(
      tx,
      this.configService.get('SERVICE_PRIVATE_KEY')
    );

    const sendTxn = await this.web3.eth.sendSignedTransaction(signPromise.rawTransaction,);

    return sendTxn.transactionHash.toString()
  }

  // Check collateral in TokenFactoryBaseContract
  // @Cron(CronExpression.EVERY_MINUTE, {
  //   name: BaseCollateralCheckJob
  // })
  // async checkBaseTokenCollateral() {
  //   const job = this.schedulerRegistry.getCronJob(BaseCollateralCheckJob)
  //   if(job) {
  //     job.stop()
  //   } else {
  //     this.logger.error('Job not found: BaseCollateralCheckJob. Failed to check base token collateral.')
  //     return
  //   }
  //
  //   try {
  //
  //   } catch (e) {
  //   } finally {
  //     job.start();
  //   }
  // }

  // Check competition contract
  @Cron(CronExpression.EVERY_MINUTE, {
    name: CompetitionScheduleCheckJob
  })
  // @Cron(CronExpression.EVERY_5_SECONDS, {
  //   name: CompetitionScheduleCheckJob
  // })
  async scheduleNextCompetition() {
    const schedulerJob = this.schedulerRegistry.getCronJob(CompetitionScheduleCheckJob)
    if(schedulerJob) {
      schedulerJob.stop()
    }

    const daysInterval = this.configService.get<number>('COMPETITION_DAYS_INTERVAL')
    const timeZone = 'America/Los_Angeles'
    let nextCompetitionDate: Moment
    let tokenFactoryAddress: string
    // Competition starts every 7 day at a random time within one hour around midnight

    try {
      const [prevCompetition] = await this.appService.getCompetitions({ limit: 1 })
      if(prevCompetition) {
        const { timestampStart, isCompleted } = prevCompetition
        tokenFactoryAddress = prevCompetition.tokenFactoryAddress

        const lastCompetitionDeltaMs = moment().diff(moment(timestampStart * 1000))
        // Interval was exceeded
        const isIntervalExceeded = lastCompetitionDeltaMs > daysInterval * 24 * 60 * 60 * 1000

        if(isCompleted || isIntervalExceeded) {
          // Start new competition tomorrow at 00:00
          nextCompetitionDate = moment()
            .tz(timeZone)
            .add(1, 'days')
            .startOf('day')
        } else {
          // Start new competition in 7 days at 00:00
          nextCompetitionDate = moment(timestampStart * 1000)
            .tz(timeZone)
            .add(daysInterval, 'days')
            .startOf('day')
        }
      } else {
        this.logger.warn(`Previous competition not found in database. New competition will be created.`)
        // Start new competition tomorrow at 00:00
        nextCompetitionDate = moment()
          .tz(timeZone)
          .add(1, 'days')
          .startOf('day')
      }

      // For local testing
      // nextCompetitionDate = moment().add(5, 'seconds')

      if(nextCompetitionDate.diff(moment(), 'minutes') < 1) {
        // Random is important otherwise they just make a new token 1 second before ending, and pumping it with a lot of ONE
        const randomMinutesNumber = getRandomNumberFromInterval(1, 59)
        // const randomMinutesNumber = 0
        nextCompetitionDate = nextCompetitionDate.add(randomMinutesNumber, 'minutes')

        this.logger.log(`Next competition scheduled at ${
          nextCompetitionDate.format('YYYY-MM-DD HH:mm:ss')
        }, ${timeZone} timezone`)
        await this.sleep(nextCompetitionDate.diff(moment(), 'milliseconds'))
        await this.initiateNewCompetition(tokenFactoryAddress)
      }
    } catch (e) {
      this.logger.error(`Failed to schedule next competition start:`, e)
    } finally {
      if(schedulerJob) {
        schedulerJob.start()
      }
    }
  }

  async initiateNewCompetition(tokenFactoryAddress: string) {
    const attemptsCount = 3
    const tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, tokenFactoryAddress);
    const tokenCollateralThreshold = BigInt(parseUnits(
      this.configService.get<number>('COMPETITION_COLLATERAL_THRESHOLD').toString(), 18
    ))

    for(let i = 0; i < attemptsCount; i++) {
      try {
        let isCollateralThresholdReached = false
        const competitionId = await this.getCompetitionId(tokenFactoryAddress)
        this.logger.log(`Current competition id=${competitionId}`)
        const tokens = await this.appService.getTokens({
          competitionId: Number(competitionId),
          limit: 10000
        })

        this.logger.log(`Checking tokens (count=${tokens.length}) for minimum collateral=${tokenCollateralThreshold} wei...`)
        for(const token of tokens) {
          const collateral = await tokenFactoryContract.methods
            .collateralById(competitionId, token.address)
            .call() as bigint

          if(collateral >= tokenCollateralThreshold) {
            isCollateralThresholdReached = true
            this.logger.log(`Token address=${token.address} received ${collateral} wei in collateral`)
            break;
          }
        }

        if(isCollateralThresholdReached) {
          this.logger.log(`Step 1/3: Initiate new competition tokenFactoryAddress=${tokenFactoryAddress} ...`)
          const newCompetitionTxHash = await this.callStartNewCompetitionTx(tokenFactoryAddress)
          this.logger.log(`New competition tokenFactoryAddress=${tokenFactoryAddress}, txHash=${newCompetitionTxHash}`)
          await this.sleep(5000)
          const newCompetitionId = await this.getCompetitionId(tokenFactoryAddress)
          this.logger.log(`Step 2/3: Started new competition id=${newCompetitionId}; calling token winner...`)
          const setWinnerHash = await this.setWinnerByCompetitionId(tokenFactoryAddress, competitionId)
          this.logger.log(`Step 3/3: setWinnerByCompetitionId called, txnHash=${setWinnerHash}`)
        } else {
          this.logger.warn(`tokenFactoryAddress=${tokenFactoryAddress}: No tokens reached minimum collateral=${tokenCollateralThreshold} wei. Waiting for the next iteration.`)
        }
        break;
      } catch (e) {
        this.logger.warn(`tokenFactoryAddress=${tokenFactoryAddress}: failed to send setWinner transaction, attempt: ${(i + 1)} / ${attemptsCount}:`, e)
        await this.sleep(10000)
      }
    }
  }

  private async callStartNewCompetitionTx(tokenFactoryAddress: string) {
    const tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, tokenFactoryAddress);
    const gasFees = await tokenFactoryContract.methods
      .startNewCompetition()
      .estimateGas({ from: this.accountAddress });

    const gasPrice = await this.web3.eth.getGasPrice();

    const tx = {
      from: this.accountAddress,
      to: tokenFactoryAddress,
      gas: gasFees * 2n,
      gasPrice,
      data: tokenFactoryContract.methods.startNewCompetition().encodeABI(),
    };

    const signPromise = await this.web3.eth.accounts.signTransaction(tx, this.configService.get('SERVICE_PRIVATE_KEY'));

    const sendTxn = await this.web3.eth.sendSignedTransaction(
      signPromise.rawTransaction,
    );

    return sendTxn.transactionHash.toString()
  }

  private async getCompetitionId (tokenFactoryAddress: string) {
    const tokenFactoryContract = new this.web3.eth.Contract(TokenFactoryABI, tokenFactoryAddress);
    return await tokenFactoryContract.methods
      .currentCompetitionId()
      .call() as bigint
  }
}
