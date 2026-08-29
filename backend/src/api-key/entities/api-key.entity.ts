import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  ownerLabel: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ default: 1000 })
  monthlyRequestQuota: number;

  @Column({ default: 0 })
  requestsThisMonth: number;

  @Column({ default: 100 })
  rateLimitPerMinute: number;

  @Column({ type: 'text', nullable: true })
  scopedEndpoints: string;

  @Column({ default: false })
  isAdmin: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
