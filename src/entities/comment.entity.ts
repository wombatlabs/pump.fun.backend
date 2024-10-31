import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";
import {UserAccount} from "./user-account.entity";

@Entity({ name: 'comments' })
export class Comment {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty()
  @Column()
  text: string;

  @ManyToOne(() => UserAccount, (userAccount) => userAccount.comments, {
    eager: true
  })
  user: UserAccount

  @ManyToOne(() => Token, (token) => token.comments, {
    eager: true
  })
  token: Token

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
