import { Test, TestingModule } from '@nestjs/testing';
import { NftMarketplaceStubController } from './nft-marketplace-stub.controller';
import { NftMarketplaceStubService } from './nft-marketplace-stub.service';

describe('NftMarketplaceStubController', () => {
  let controller: NftMarketplaceStubController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      findAll: jest.fn().mockReturnValue([{ id: '1', name: 'Cyber Lion', price: 1.5 }]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NftMarketplaceStubController],
      providers: [{ provide: NftMarketplaceStubService, useValue: serviceMock }],
    }).compile();

    controller = module.get<NftMarketplaceStubController>(NftMarketplaceStubController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists all NFTs', () => {
    const list = controller.listAllNfts();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Cyber Lion');
    expect(serviceMock.findAll).toHaveBeenCalled();
  });
});
