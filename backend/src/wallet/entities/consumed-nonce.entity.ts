import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Records nonces that have already been consumed by a wallet signature
 * verification. Enforces single-use challenges and prevents replay attacks.
 */
@Entity('consumed_wallet_nonces')
@Index(['walletAddress', 'nonce'])
export class ConsumedWalletNonce {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 128 })
  nonce: string;

  @Column({ length: 64 })
  walletAddress: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ length: 255, nullable: true })
  domain: string;

  @Column({ type: 'timestamp' })
  consumedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}