import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { economyConfig } from '../../config/economy';
import { NftListing, NftListingStatus } from './entities/nft-listing.entity';
import { NftOfferStatus, NftTradeOffer } from './entities/nft-trade-offer.entity';
import { CreateListingDto, CreateOfferDto, OfferDecision } from './dto/marketplace.dto';

/** XLM has 7 decimals (stropes); all money math is done in integer stropes. */
const STROOPES = BigInt(1e7);

function xlmToStropes(amount: string | number): bigint {
  return BigInt(Math.round(parseFloat(String(amount)) * 1e7));
}

function stropesToXlm(stropes: bigint): string {
  const negative = stropes < BigInt(0);
  const abs = negative ? -stropes : stropes;
  const whole = abs / STROOPES;
  const frac = (abs % STROOPES).toString().padStart(7, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export interface MarketplaceSettings {
  /** Marketplace fee in basis points (100 bps = 1%). Configurable (issue #735). */
  feeBps: number;
  /** Stellar account acting as escrow, when configured. */
  escrowAccount: string | null;
}

@Injectable()
export class NftMarketplaceService {
  private readonly logger = new Logger(NftMarketplaceService.name);

  constructor(
    @InjectRepository(NftListing)
    private readonly listingsRepo: Repository<NftListing>,
    @InjectRepository(NftTradeOffer)
    private readonly offersRepo: Repository<NftTradeOffer>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fees are configurable: `MARKETPLACE_FEE_BPS` overrides the economy
   * config default, and the escrow account comes from
   * `MARKETPLACE_ESCROW_ADDRESS` (unset = platform-managed default escrow,
   * recorded per listing once on-chain settlement is wired up).
   */
  getSettings(): MarketplaceSettings {
    const envFee = this.configService.get<string>('MARKETPLACE_FEE_BPS');
    const feeBps = envFee !== undefined ? Number(envFee) : economyConfig.marketplace.feeBps;
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
      throw new BadRequestException(
        `Marketplace fee must be an integer between 0 and 10000 basis points, got "${envFee}".`,
      );
    }
    return {
      feeBps,
      escrowAccount: this.configService.get<string>('MARKETPLACE_ESCROW_ADDRESS') || null,
    };
  }

  // ── Listings ──────────────────────────────────────────────────────────

  async createListing(sellerId: string, dto: CreateListingDto): Promise<NftListing> {
    const listing = this.listingsRepo.create({
      sellerId,
      nftId: dto.nftId,
      name: dto.name,
      imageUrl: dto.imageUrl ?? null,
      description: dto.description ?? null,
      price: dto.price.toFixed(7),
      status: NftListingStatus.LISTED,
    });
    const saved = await this.listingsRepo.save(listing);
    this.logger.log(`Listing created: NFT ${dto.nftId} by ${sellerId} at ${saved.price} XLM.`);
    return saved;
  }

  async cancelListing(listingId: string, requesterId: string): Promise<NftListing> {
    const listing = await this.getListingOrThrow(listingId);
    if (listing.sellerId !== requesterId) {
      throw new ForbiddenException('Only the seller can cancel a listing.');
    }
    if (listing.status !== NftListingStatus.LISTED) {
      throw new BadRequestException(
        `Listing is ${listing.status}; only open listings can be cancelled.`,
      );
    }
    listing.status = NftListingStatus.CANCELLED;
    const saved = await this.listingsRepo.save(listing);

    // Withdraw any pending offers against the cancelled listing.
    await this.offersRepo.update(
      { listingId, status: NftOfferStatus.PENDING },
      { status: NftOfferStatus.CANCELLED, respondedAt: new Date() },
    );
    this.logger.log(`Listing ${listingId} cancelled by ${requesterId}.`);
    return saved;
  }

  async getListing(listingId: string): Promise<NftListing> {
    return this.getListingOrThrow(listingId);
  }

  async getActiveListings(filters: { sellerId?: string; limit?: number } = {}) {
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
    const qb = this.listingsRepo
      .createQueryBuilder('listing')
      .where('listing.status IN (:...statuses)', {
        statuses: [NftListingStatus.LISTED, NftListingStatus.ESCROWED],
      })
      .orderBy('listing.createdAt', 'DESC')
      .take(limit);
    if (filters.sellerId) {
      qb.andWhere('listing.sellerId = :sellerId', { sellerId: filters.sellerId });
    }
    return qb.getMany();
  }

  // ── Offers ────────────────────────────────────────────────────────────

  async createOffer(listingId: string, offerorId: string, dto: CreateOfferDto): Promise<NftTradeOffer> {
    const listing = await this.getListingOrThrow(listingId);
    if (listing.status !== NftListingStatus.LISTED) {
      throw new BadRequestException(`Listing is ${listing.status}; offers are only open on listed NFTs.`);
    }
    if (listing.sellerId === offerorId) {
      throw new BadRequestException('The seller cannot offer on their own listing.');
    }

    const offer = this.offersRepo.create({
      listingId,
      offerorId,
      amount: dto.amount.toFixed(7),
      status: NftOfferStatus.PENDING,
    });
    const saved = await this.offersRepo.save(offer);
    this.logger.log(`Offer ${saved.id} of ${saved.amount} XLM on listing ${listingId} by ${offerorId}.`);
    return saved;
  }

  async cancelOffer(offerId: string, requesterId: string): Promise<NftTradeOffer> {
    const offer = await this.getOfferOrThrow(offerId);
    if (offer.offerorId !== requesterId) {
      throw new ForbiddenException('Only the offeror can withdraw an offer.');
    }
    if (offer.status !== NftOfferStatus.PENDING) {
      throw new BadRequestException(`Offer is ${offer.status}; only pending offers can be withdrawn.`);
    }
    offer.status = NftOfferStatus.CANCELLED;
    offer.respondedAt = new Date();
    return this.offersRepo.save(offer);
  }

  async getOffersForListing(listingId: string): Promise<NftTradeOffer[]> {
    await this.getListingOrThrow(listingId);
    return this.offersRepo.find({
      where: { listingId },
      order: { createdAt: 'DESC' },
    });
  }

  async getOffersByUser(offerorId: string): Promise<NftTradeOffer[]> {
    return this.offersRepo.find({
      where: { offerorId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Seller decision on a pending offer (offer/accept flow, issue #735).
   *
   * Accepting moves the NFT into escrow: the listing is locked, the escrow
   * account is recorded, and every other pending offer on the listing is
   * marked outbid. Settlement (transfer + fee-charged payout) happens in
   * `settleEscrow`.
   */
  async respondToOffer(
    offerId: string,
    requesterId: string,
    decision: OfferDecision,
  ): Promise<{ offer: NftTradeOffer; listing: NftListing }> {
    const offer = await this.getOfferOrThrow(offerId);
    const listing = await this.getListingOrThrow(offer.listingId);

    if (listing.sellerId !== requesterId) {
      throw new ForbiddenException('Only the seller can respond to offers on this listing.');
    }
    if (offer.status !== NftOfferStatus.PENDING) {
      throw new BadRequestException(`Offer is ${offer.status}; only pending offers can be responded to.`);
    }
    if (listing.status !== NftListingStatus.LISTED) {
      throw new BadRequestException(`Listing is ${listing.status}; it is no longer open for offers.`);
    }

    offer.respondedAt = new Date();

    if (decision === OfferDecision.REJECT) {
      offer.status = NftOfferStatus.REJECTED;
      const savedOffer = await this.offersRepo.save(offer);
      this.logger.log(`Offer ${offerId} rejected by seller ${requesterId}.`);
      return { offer: savedOffer, listing };
    }

    // Accept: enter escrow and outbid the remaining pending offers.
    offer.status = NftOfferStatus.ACCEPTED;
    const settings = this.getSettings();
    listing.status = NftListingStatus.ESCROWED;
    listing.escrowAccount = settings.escrowAccount;
    listing.escrowedAt = new Date();

    const savedOffer = await this.offersRepo.save(offer);
    const savedListing = await this.listingsRepo.save(listing);

    await this.offersRepo.update(
      { listingId: listing.id, status: NftOfferStatus.PENDING },
      { status: NftOfferStatus.OUTBID, respondedAt: new Date() },
    );

    this.logger.log(
      `Offer ${offerId} accepted; listing ${listing.id} entered escrow` +
        `${settings.escrowAccount ? ` at ${settings.escrowAccount}` : ''}.`,
    );
    return { offer: savedOffer, listing: savedListing };
  }

  // ── Escrow settlement ─────────────────────────────────────────────────

  /**
   * Settles an escrowed listing: the NFT transfers to the buyer, the
   * marketplace fee is charged, and the seller receives the remainder.
   * (On-chain this maps to a Soroban escrow release / path payment; the
   * ledger fields below are the reconciliation record.)
   */
  async settleEscrow(
    listingId: string,
    requesterId: string,
  ): Promise<{
    listing: NftListing;
    soldPrice: string;
    feeCharged: string;
    sellerProceeds: string;
    buyerId: string;
  }> {
    const listing = await this.getListingOrThrow(listingId);
    if (listing.sellerId !== requesterId) {
      throw new ForbiddenException('Only the seller can settle the escrow.');
    }
    if (listing.status !== NftListingStatus.ESCROWED) {
      throw new BadRequestException(
        `Listing is ${listing.status}; only escrowed listings can be settled.`,
      );
    }

    const acceptedOffer = await this.offersRepo.findOne({
      where: { listingId, status: NftOfferStatus.ACCEPTED },
    });
    if (!acceptedOffer) {
      throw new BadRequestException('No accepted offer found for this escrow.');
    }

    const { feeBps } = this.getSettings();
    const soldStropes = xlmToStropes(acceptedOffer.amount);
    const feeStropes = (soldStropes * BigInt(feeBps)) / BigInt(10000);
    const proceedsStropes = soldStropes - feeStropes;

    listing.status = NftListingStatus.SOLD;
    listing.buyerId = acceptedOffer.offerorId;
    listing.soldPrice = acceptedOffer.amount;
    listing.feeCharged = stropesToXlm(feeStropes);
    listing.sellerProceeds = stropesToXlm(proceedsStropes);
    listing.escrowReleasedAt = new Date();

    const saved = await this.listingsRepo.save(listing);
    this.logger.log(
      `Escrow settled for listing ${listingId}: sold at ${listing.soldPrice} XLM, ` +
        `fee ${listing.feeCharged} XLM (${feeBps} bps), seller proceeds ${listing.sellerProceeds} XLM.`,
    );

    return {
      listing: saved,
      soldPrice: listing.soldPrice!,
      feeCharged: listing.feeCharged!,
      sellerProceeds: listing.sellerProceeds!,
      buyerId: listing.buyerId!,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async getListingOrThrow(listingId: string): Promise<NftListing> {
    const listing = await this.listingsRepo.findOne({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException(`Listing "${listingId}" not found.`);
    }
    return listing;
  }

  private async getOfferOrThrow(offerId: string): Promise<NftTradeOffer> {
    const offer = await this.offersRepo.findOne({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException(`Offer "${offerId}" not found.`);
    }
    return offer;
  }
}
