import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";

@Entity({ name: 'swaps' })
export class Swap {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  txnHash: string;

  @ApiProperty()
  @Column({ type: 'bigint' })
  blockNumber: string;

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
  prevPrice: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  price: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  mCap: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  liquidity: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  volume: string;

  @ApiProperty()
  @Column({ type: 'decimal' })
  volume24H: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
