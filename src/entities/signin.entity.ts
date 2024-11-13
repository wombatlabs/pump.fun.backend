import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";
import {ApiProperty} from "@nestjs/swagger";

@Entity({ name: 'signin_requests' })
export class SignInRequestEntity {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ unique: true })
  address: string;

  @ApiProperty()
  @Column({ type: 'integer', nullable: false })
  nonce: number;

  @ApiProperty()
  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
