import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable, ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";
import {Comment} from "./comment.entity";

@Entity({ name: 'users' })
export class UserAccount {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  address: string;

  @ApiProperty()
  @Column()
  username: string;

  @OneToMany(() => Token, (token) => token.user)
  tokens: Token[]

  @OneToMany(() => Comment, (comment) => comment.user)
  comments: Comment[]

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
