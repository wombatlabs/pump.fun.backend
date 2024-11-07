import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne, UpdateDateColumn
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";
import {UserAccount} from "./user-account.entity";

@Entity({ name: 'token_balances' })
export class TokenBalance {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserAccount, {
    eager: true
  })
  user: UserAccount

  @ManyToOne(() => Token, {
    eager: true
  })
  token: Token

  @ApiProperty()
  @Column({ type: 'decimal', default: 0 })
  balance: string;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updateAt' })
  updatedAt: Date;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
