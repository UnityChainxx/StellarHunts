import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/** Lifecycle of an offer on a listing (issue #735). */
export enum NftOfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  /** Superseded by another accepted offer on the same listing. */
  OUTBID = 'outbid',
  /** Withdrawn by the offeror before the seller responded. */
  CANCELLED = 'cancelled',
}

@Entity('nft_trade_offer')
@Index(['listingId', 'status'])
@Index(['offerorId'])
export class NftTradeOffer {
  @ApiProperty({ description: 'Unique identifier for the offer' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Listing the offer was made on' })
  @Column({ type: 'uuid' })
  listingId: string;

  @ApiProperty({ description: 'User ID of the buyer making the offer' })
  @Column({ type: 'varchar', length: 128 })
  offerorId: string;

  @ApiProperty({ description: 'Offered amount in XLM' })
  @Column({ type: 'numeric', precision: 18, scale: 7 })
  amount: string;

  @ApiProperty({ description: 'Offer status', enum: NftOfferStatus })
  @Column({ type: 'enum', enum: NftOfferStatus, default: NftOfferStatus.PENDING })
  status: NftOfferStatus;

  @ApiProperty({ description: 'When the seller responded', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
