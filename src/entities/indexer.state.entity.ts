import {
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'indexer_state' })
export class IndexerState {
  @ApiProperty()
  @PrimaryColumn({ type: 'varchar', unique: true })
  name: string;

  @ApiProperty()
  @Column({ type: 'integer' })
  blockNumber: number;
}
