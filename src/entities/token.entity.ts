import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable, AfterLoad, AfterInsert, AfterUpdate, OneToOne, ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Comment} from "./comment.entity";
import {UserAccount} from "./user-account.entity";
import {TokenMetadata} from "../types";

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

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
