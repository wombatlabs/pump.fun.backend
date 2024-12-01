import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
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
  @Column({ type: 'bigint' })
  competitionId: number;

  @ApiProperty()
  @Column({ type: 'bigint' })
  timestamp: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
