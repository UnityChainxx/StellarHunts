import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/** Lifecycle of a marketplace listing (issue #735). */
export enum NftListingStatus {
  /** Open for offers. */
  LISTED = 'listed',
  /** An offer was accepted; the NFT is held by the platform escrow. */
  ESCROWED = 'escrowed',
  /** Escrow settled: NFT transferred to the buyer, seller paid minus fee. */
  SOLD = 'sold',
  /** Withdrawn by the seller before any offer was accepted. */
  CANCELLED = 'cancelled',
}

@Entity('nft_listing')
@Index(['sellerId', 'status'])
export class NftListing {
  @ApiProperty({ description: 'Unique identifier for the listing' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'On-chain identifier of the NFT being traded' })
  @Column({ type: 'varchar', length: 128 })
  nftId: string;

  @ApiProperty({ description: 'Display name of the NFT' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ description: 'Image URL of the NFT', required: false })
  @Column({ type: 'text', nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: 'Free-text description of the NFT', required: false })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({ description: 'User ID of the seller (current owner)' })
  @Column({ type: 'varchar', length: 128 })
  sellerId: string;

  @ApiProperty({ description: 'Asking price in XLM' })
  @Column({ type: 'numeric', precision: 18, scale: 7 })
  price: string;

  @ApiProperty({ description: 'Lifecycle status', enum: NftListingStatus })
  @Column({ type: 'enum', enum: NftListingStatus, default: NftListingStatus.LISTED })
  status: NftListingStatus;

  @ApiProperty({ description: 'User ID of the buyer once sold', required: false })
  @Column({ type: 'varchar', length: 128, nullable: true })
  buyerId: string | null;

  @ApiProperty({
    description: 'Stellar escrow account holding the NFT while escrowed',
    required: false,
  })
  @Column({ type: 'varchar', length: 128, nullable: true })
  escrowAccount: string | null;

  @ApiProperty({ description: 'When the NFT entered escrow', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  escrowedAt: Date | null;

  @ApiProperty({ description: 'When the escrow was settled', required: false })
  @Column({ type: 'timestamptz', nullable: true })
  escrowReleasedAt: Date | null;

  @ApiProperty({ description: 'Marketplace fee charged at settlement (XLM)', required: false })
  @Column({ type: 'numeric', precision: 18, scale: 7, nullable: true })
  feeCharged: string | null;

  @ApiProperty({ description: 'Proceeds paid to the seller at settlement (XLM)', required: false })
  @Column({ type: 'numeric', precision: 18, scale: 7, nullable: true })
  sellerProceeds: string | null;

  @ApiProperty({ description: 'Price actually paid at settlement (XLM)', required: false })
  @Column({ type: 'numeric', precision: 18, scale: 7, nullable: true })
  soldPrice: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
