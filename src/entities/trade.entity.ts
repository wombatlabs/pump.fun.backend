import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";

export enum TradeType {
  buy = 'buy',
  sell = 'sell'
}

@Entity({ name: 'trades' })
export class Trade {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  txnHash: string;

  @ApiProperty()
  @Column({ type: 'integer' })
  blockNumber: number;

  @ApiProperty()
  @Column({ type: 'enum', enum: TradeType })
  type: TradeType;

  @ManyToOne(() => Token, (token) => token.comments)
  token: Token

  @ApiProperty()
  @Column({ type: 'decimal' })
  amountIn: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  amountOut: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  fee: string;

  @ApiProperty()
  @Column({ type: 'bigint' })
  timestamp: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
