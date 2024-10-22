import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import {Token} from "./token.entity";

@Entity({ name: 'comments' })
export class Comment {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column()
  userAddress: string;

  @ApiProperty()
  @Column()
  text: string;

  @ManyToOne(() => Token, (token) => token.comments)
  token: Token

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;
}
