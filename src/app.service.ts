import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Contract, ContractAbi, Web3} from "web3";
import * as PumpFunABI from '../abi/PumpFunABI.json'

@Injectable()
export class AppService {
    private readonly logger = new Logger(AppService.name);
    private readonly web3: Web3
    private readonly pumpFunContract: Contract<ContractAbi>
    private readonly blocksIndexingRange = 1000
    constructor(
      private configService: ConfigService,
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

    async eventsTrackingLoop(
      fromBlockParam = +this.configService.get<number>('PUMP_FUN_INITIAL_BLOCK_NUMBER')
    ) {
        let fromBlock = fromBlockParam
        let toBlock = fromBlock
        try {
            const blockchainBlockNumber = +(String(await this.web3.eth.getBlockNumber()))
            toBlock = fromBlock + this.blocksIndexingRange
            if(toBlock > blockchainBlockNumber) {
                toBlock = blockchainBlockNumber
            }
            toBlock = toBlock - 1

            if(toBlock - fromBlock > 1) {
                const events = await this.pumpFunContract.getPastEvents('allEvents', {
                    fromBlock,
                    toBlock,
                    topics: [this.web3.utils.sha3('Launched(address,address,uint256)')],
                });
                this.logger.log(`[${fromBlock}-${toBlock}] (${((toBlock - fromBlock + 1))} blocks), events: ${events.length}`)
            } else {
                // wait for blockchain
                toBlock = fromBlockParam
                await new Promise(resolve => setTimeout(resolve, 5 * 1000));
            }
        } catch (e) {
            this.logger.error(`[${fromBlock}] Failed to process:`, e)
        }
        this.eventsTrackingLoop(toBlock)
    }
}
