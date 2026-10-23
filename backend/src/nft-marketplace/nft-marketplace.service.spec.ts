import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { NftMarketplaceService } from './nft-marketplace.service';
import { NftListing, NftListingStatus } from './entities/nft-listing.entity';
import { NftTradeOffer, NftOfferStatus } from './entities/nft-trade-offer.entity';
import { CreateListingDto, OfferDecision } from './dto/marketplace.dto';

const SELLER = 'seller-1';
const BUYER = 'buyer-1';

function makeListing(overrides: Partial<NftListing> = {}): NftListing {
  return {
    id: 'listing-1',
    nftId: 'nft-42',
    name: 'Cyber Lion',
    imageUrl: null,
    description: null,
    sellerId: SELLER,
    price: '25.0000000',
    status: NftListingStatus.LISTED,
    buyerId: null,
    escrowAccount: null,
    escrowedAt: null,
    escrowReleasedAt: null,
    feeCharged: null,
    sellerProceeds: null,
    soldPrice: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NftListing;
}

function makeOffer(overrides: Partial<NftTradeOffer> = {}): NftTradeOffer {
  return {
    id: 'offer-1',
    listingId: 'listing-1',
    offerorId: BUYER,
    amount: '20.0000000',
    status: NftOfferStatus.PENDING,
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NftTradeOffer;
}

describe('NftMarketplaceService', () => {
  let service: NftMarketplaceService;
  let listingsRepo: any;
  let offersRepo: any;

  beforeEach(async () => {
    listingsRepo = {
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(),
      update: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          getMany: jest.fn(async () => []),
        };
        return qb;
      }),
    };
    offersRepo = {
      create: jest.fn((v) => ({ ...v })),
      save: jest.fn(async (v) => v),
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      update: jest.fn(async () => undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftMarketplaceService,
        { provide: getRepositoryToken(NftListing), useValue: listingsRepo },
        { provide: getRepositoryToken(NftTradeOffer), useValue: offersRepo },
        { provide: ConfigService, useValue: { get: jest.fn(() => undefined) } },
      ],
    }).compile();

    service = module.get<NftMarketplaceService>(NftMarketplaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('settings & fees', () => {
    it('defaults the fee to the economy config (250 bps)', () => {
      expect(service.getSettings().feeBps).toBe(250);
    });

    it('accepts a configured override and rejects out-of-range values', () => {
      const override = {
        get: jest.fn((key: string) =>
          key === 'MARKETPLACE_FEE_BPS' ? '150' : undefined,
        ),
      };
      const overridden = new NftMarketplaceService(
        listingsRepo,
        offersRepo,
        override as any,
      );
      expect(overridden.getSettings().feeBps).toBe(150);

      const invalid = {
        get: jest.fn((key: string) =>
          key === 'MARKETPLACE_FEE_BPS' ? '99999' : undefined,
        ),
      };
      const bad = new NftMarketplaceService(
        listingsRepo,
        offersRepo,
        invalid as any,
      );
      expect(() => bad.getSettings()).toThrow(BadRequestException);
    });
  });

  describe('listings', () => {
    it('creates a listing with a normalised price', async () => {
      listingsRepo.create.mockImplementation((v) => v);
      const dto: CreateListingDto = {
        nftId: 'nft-42',
        name: 'Cyber Lion',
        price: 25,
      };
      const listing = await service.createListing(SELLER, dto);
      expect(listing.status).toBe(NftListingStatus.LISTED);
      expect(listing.price).toBe('25.0000000');
      expect(listingsRepo.save).toHaveBeenCalled();
    });

    it('cancels a listing as the seller and withdraws pending offers', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing());
      const listing = await service.cancelListing('listing-1', SELLER);
      expect(listing.status).toBe(NftListingStatus.CANCELLED);
      expect(offersRepo.update).toHaveBeenCalledWith(
        { listingId: 'listing-1', status: NftOfferStatus.PENDING },
        expect.objectContaining({ status: NftOfferStatus.CANCELLED }),
      );
    });

    it('refuses cancellation by a non-seller or on a sold listing', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing());
      await expect(service.cancelListing('listing-1', BUYER)).rejects.toThrow(ForbiddenException);
      listingsRepo.findOne.mockResolvedValue(makeListing({ status: NftListingStatus.SOLD }));
      await expect(service.cancelListing('listing-1', SELLER)).rejects.toThrow(BadRequestException);
    });

    it('throws when the listing does not exist', async () => {
      listingsRepo.findOne.mockResolvedValue(null);
      await expect(service.getListing('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('offers', () => {
    it('creates a pending offer on a listed NFT', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing());
      const offer = await service.createOffer('listing-1', BUYER, { amount: 20 });
      expect(offer.status).toBe(NftOfferStatus.PENDING);
      expect(offer.amount).toBe('20.0000000');
    });

    it('rejects offers on escrowed listings and self-offers', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing({ status: NftListingStatus.ESCROWED }));
      await expect(
        service.createOffer('listing-1', BUYER, { amount: 20 }),
      ).rejects.toThrow(BadRequestException);

      listingsRepo.findOne.mockResolvedValue(makeListing());
      await expect(
        service.createOffer('listing-1', SELLER, { amount: 20 }),
      ).rejects.toThrow(/seller cannot offer/);
    });

    it('lets the offeror withdraw a pending offer only', async () => {
      offersRepo.findOne.mockResolvedValue(makeOffer());
      const offer = await service.cancelOffer('offer-1', BUYER);
      expect(offer.status).toBe(NftOfferStatus.CANCELLED);

      offersRepo.findOne.mockResolvedValue(makeOffer({ status: NftOfferStatus.ACCEPTED }));
      await expect(service.cancelOffer('offer-1', BUYER)).rejects.toThrow(BadRequestException);
      offersRepo.findOne.mockResolvedValue(makeOffer());
      await expect(service.cancelOffer('offer-1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('respondToOffer (offer/accept flow)', () => {
    it('accepting moves the listing into escrow and outbids other offers', async () => {
      offersRepo.findOne.mockResolvedValue(makeOffer());
      listingsRepo.findOne.mockResolvedValue(makeListing());

      const { offer, listing } = await service.respondToOffer(
        'offer-1',
        SELLER,
        OfferDecision.ACCEPT,
      );

      expect(offer.status).toBe(NftOfferStatus.ACCEPTED);
      expect(listing.status).toBe(NftListingStatus.ESCROWED);
      expect(listing.escrowedAt).toBeInstanceOf(Date);
      expect(offersRepo.update).toHaveBeenCalledWith(
        { listingId: 'listing-1', status: NftOfferStatus.PENDING },
        expect.objectContaining({ status: NftOfferStatus.OUTBID }),
      );
    });

    it('rejecting only marks the offer rejected', async () => {
      offersRepo.findOne.mockResolvedValue(makeOffer());
      listingsRepo.findOne.mockResolvedValue(makeListing());

      const { offer, listing } = await service.respondToOffer(
        'offer-1',
        SELLER,
        OfferDecision.REJECT,
      );
      expect(offer.status).toBe(NftOfferStatus.REJECTED);
      expect(listing.status).toBe(NftListingStatus.LISTED);
    });

    it('enforces seller ownership and pending state', async () => {
      offersRepo.findOne.mockResolvedValue(makeOffer());
      listingsRepo.findOne.mockResolvedValue(makeListing());
      await expect(
        service.respondToOffer('offer-1', BUYER, OfferDecision.ACCEPT),
      ).rejects.toThrow(ForbiddenException);

      offersRepo.findOne.mockResolvedValue(makeOffer({ status: NftOfferStatus.REJECTED }));
      await expect(
        service.respondToOffer('offer-1', SELLER, OfferDecision.ACCEPT),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('settleEscrow', () => {
    it('splits the sale with the configurable fee and credits the buyer', async () => {
      const listing = makeListing({ status: NftListingStatus.ESCROWED });
      listingsRepo.findOne.mockResolvedValue(listing);
      offersRepo.findOne.mockResolvedValue(makeOffer({ amount: '20.0000000' }));

      const result = await service.settleEscrow('listing-1', SELLER);

      // 20 XLM at 250 bps (2.5%) = 0.5 XLM fee, 19.5 XLM proceeds.
      expect(result.soldPrice).toBe('20.0000000');
      expect(result.feeCharged).toBe('0.5000000');
      expect(result.sellerProceeds).toBe('19.5000000');
      expect(result.buyerId).toBe(BUYER);

      expect(listing.status).toBe(NftListingStatus.SOLD);
      expect(listing.escrowReleasedAt).toBeInstanceOf(Date);
    });

    it('refuses settlement by a non-seller and on non-escrowed listings', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing());
      await expect(service.settleEscrow('listing-1', BUYER)).rejects.toThrow(ForbiddenException);

      listingsRepo.findOne.mockResolvedValue(makeListing({ status: NftListingStatus.LISTED }));
      await expect(service.settleEscrow('listing-1', SELLER)).rejects.toThrow(BadRequestException);
    });

    it('fails when no accepted offer backs the escrow', async () => {
      listingsRepo.findOne.mockResolvedValue(makeListing({ status: NftListingStatus.ESCROWED }));
      offersRepo.findOne.mockResolvedValue(null);
      await expect(service.settleEscrow('listing-1', SELLER)).rejects.toThrow(
        /No accepted offer/,
      );
    });
  });
});
