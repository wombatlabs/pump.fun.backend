import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  JoinColumn, OneToMany
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";

@Entity({ name: 'competitions' })
export class CompetitionEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column()
  txnHash: string;

  @ApiProperty()
  @Column({ type: 'integer' })
  blockNumber: number;

  @ApiProperty()
  @Column()
  tokenFactoryAddress: string;

  @ApiProperty()
  @Column({ type: 'integer' })
  competitionId: number;

  @ApiProperty()
  @Column({ type: 'bigint', nullable: false })
  timestampStart: number;

  @ApiProperty()
  @Column({ type: 'bigint', nullable: true })
  timestampEnd: number;

  @ApiProperty()
  @Column('bool', { default: false })
  isCompleted: boolean;

  @ApiProperty()
  @OneToOne((type) => Token, token => token.competition)
  @JoinColumn()
  winnerToken: Token | null

  @OneToMany(() => Token, (token) => token.competition)
  tokens: Token[]

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
