import {EventLog} from "web3";

export enum TradeType {
  buy = 'buy',
  sell = 'sell'
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export interface TokenMetadata {
  userAddress: string
  name: string
  ticker: string
  description: string
  image: string
  twitterLink: string
  telegramLink: string
  websiteLink: string
}

export interface Candle {
  highPrice: string
  lowPrice: string
  volume: string
  time: string
}

export interface ProtocolEvent {
  data: EventLog
  type: ProtocolEventType
}

export type ProtocolEventType = 'create_token' | 'buy' | 'sell' | 'set_winner' | 'burn_token_and_set_winner' | 'winner_liquidity' | 'new_competition'
