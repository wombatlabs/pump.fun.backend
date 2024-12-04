import {EventLog} from "web3";

export enum TradeType {
  buy = 'buy',
  sell = 'sell'
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
