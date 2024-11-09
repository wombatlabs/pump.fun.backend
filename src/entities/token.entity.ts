import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinTable,
  ManyToOne, AfterUpdate, AfterInsert, AfterLoad
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Comment} from "./comment.entity";
import {UserAccount} from "./user-account.entity";
import {TokenMetadata} from "../types";
import {Trade} from "./trade.entity";
import Decimal from "decimal.js";

export class ColumnNumericTransformer {
  to(data: string): string {
    return data;
  }
  from(data: number): string {
    return new Decimal(data).toFixed()
  }
}

@Entity({ name: 'tokens' })
export class Token {
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
  @Column({ unique: true })
  address: string;

  @ApiProperty()
  @Column()
  name: string;

  @ApiProperty()
  @Column()
  symbol: string;

  @ApiProperty()
  @Column()
  uri: string;

  @Column({ type: 'json', nullable: true })
  uriData: TokenMetadata | null;

  @ApiProperty()
  @Column({ type: 'integer' })
  timestamp: number;

  @ManyToOne(() => UserAccount, (user) => user.tokens, {
    eager: true
  })
  @JoinTable()
  user: UserAccount

  @OneToMany(() => Comment, (comment) => comment.token)
  @JoinTable()
  comments: Comment[]

  @OneToMany(() => Trade, (trade) => trade.token)
  @JoinTable()
  trades: Trade[]

  @ApiProperty()
  @Column({ type: 'decimal', default: 0 })
  totalSupply: string;

  @ApiProperty()
  @Column({ type: 'double precision', default: 0, transformer: new ColumnNumericTransformer() })
  price: string;

  protected marketCap: String;

  @ApiProperty()
  @AfterInsert()
  @AfterUpdate()
  @AfterLoad()
  updateMarketCap() {
    this.marketCap = new Decimal(this.price)
      .mul(new Decimal(this.totalSupply).div(10 ** 18))
      .toFixed()
  }

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
