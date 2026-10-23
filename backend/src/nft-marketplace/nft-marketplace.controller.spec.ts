import { Test, TestingModule } from '@nestjs/testing';
import { NftMarketplaceController } from './nft-marketplace.controller';
import { NftMarketplaceService } from './nft-marketplace.service';
import { OfferDecision } from './dto/marketplace.dto';

describe('NftMarketplaceController', () => {
  let controller: NftMarketplaceController;
  let serviceMock: any;

  const listing = { id: 'listing-1', name: 'Cyber Lion', status: 'listed' };
  const offer = { id: 'offer-1', amount: '20.0000000', status: 'pending' };

  beforeEach(async () => {
    serviceMock = {
      getActiveListings: jest.fn().mockResolvedValue([listing]),
      getListing: jest.fn().mockResolvedValue(listing),
      getOffersForListing: jest.fn().mockResolvedValue([offer]),
      getOffersByUser: jest.fn().mockResolvedValue([offer]),
      createListing: jest.fn().mockResolvedValue(listing),
      cancelListing: jest.fn().mockResolvedValue(listing),
      createOffer: jest.fn().mockResolvedValue(offer),
      cancelOffer: jest.fn().mockResolvedValue(offer),
      respondToOffer: jest.fn().mockResolvedValue({ offer, listing }),
      settleEscrow: jest
        .fn()
        .mockResolvedValue({ listing, soldPrice: '20.0000000', feeCharged: '0.5000000', sellerProceeds: '19.5000000' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftMarketplaceController],
      providers: [{ provide: NftMarketplaceService, useValue: serviceMock }],
    }).compile();

    controller = module.get<NftMarketplaceController>(NftMarketplaceController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists active listings', async () => {
    expect(await controller.getActiveListings({})).toEqual([listing]);
  });

  it('creates a listing attributed to the caller', async () => {
    await controller.createListing(
      { nftId: 'nft-42', name: 'Cyber Lion', price: 25 },
      { user: { sub: 'seller-1' } },
    );
    expect(serviceMock.createListing).toHaveBeenCalledWith(
      'seller-1',
      expect.objectContaining({ nftId: 'nft-42' }),
    );
  });

  it('creates an offer attributed to the caller', async () => {
    await controller.createOffer(
      'listing-1',
      { amount: 20 },
      { user: { id: 'buyer-1' } },
    );
    expect(serviceMock.createOffer).toHaveBeenCalledWith(
      'listing-1',
      'buyer-1',
      { amount: 20 },
    );
  });

  it('responds to offers with the seller decision', async () => {
    await controller.respondToOffer(
      'offer-1',
      { decision: OfferDecision.ACCEPT },
      { user: { sub: 'seller-1' } },
    );
    expect(serviceMock.respondToOffer).toHaveBeenCalledWith(
      'offer-1',
      'seller-1',
      'accept',
    );
  });

  it('settles the escrow for the seller', async () => {
    const result = await controller.settleEscrow('listing-1', {
      user: { sub: 'seller-1' },
    });
    expect(serviceMock.settleEscrow).toHaveBeenCalledWith('listing-1', 'seller-1');
    expect(result.feeCharged).toBe('0.5000000');
  });

  it('hides other users offers', async () => {
    const res = await controller.getMyOffers('someone-else', {
      user: { sub: 'buyer-1' },
    });
    expect(res).toEqual([]);
    expect(serviceMock.getOffersByUser).not.toHaveBeenCalled();
  });
});
