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
import {Comment} from "./comment.entity";

@Entity({ name: 'tokens' })
export class Token {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  txnHash: string;

  @ApiProperty()
  @Column({ type: 'bigint' })
  blockNumber: string;

  @ApiProperty()
  @Column({ unique: true })
  address: string;

  @ApiProperty()
  @Column()
  pairAddress: string;

  @ApiProperty()
  @Column()
  amount: string;

  @OneToMany(() => Comment, (comment) => comment.token, { eager: true })
  @JoinTable()
  comments: Comment[]

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
