import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'reports' })
export class ReportEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ required: true })
  @Column({ type: 'smallint' })
  type: number;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  tokenAddress: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  userAddress: string;

  @ApiProperty({ required: false })
  @Column({ nullable: true })
  reporterUserAddress: string;

  @ApiProperty()
  @Column({ nullable: true })
  details: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
