import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";

@Entity({ name: 'token_winners' })
export class TokenWinner {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Token, {
    eager: true
  })
  token: Token

  @ApiProperty()
  @Column({ type: 'decimal', default: 0 })
  competitionId: string;

  @ApiProperty()
  @Column({ type: 'decimal', default: 0 })
  timestamp: string;

  @ApiProperty()
  @Column()
  txnHash: string;

  @ApiProperty()
  @Column({ type: 'integer' })
  blockNumber: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
