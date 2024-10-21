import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

@Entity({ name: 'tokens' })
export class Token {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  address: string;

  @ApiProperty()
  @Column()
  pairAddress: string;

  @ApiProperty()
  @Column()
  amount: string;

  @ApiProperty()
  @Column()
  txHash: string;

  @ApiProperty()
  @Column()
  blockNumber: string;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  // getBlockchainAccounts(): IBlockchainAccount[] {
  //   return this.blockchainAccounts.map(item => ({
  //     id: item.id,
  //     address: item.address,
  //   }))
  // }
}
