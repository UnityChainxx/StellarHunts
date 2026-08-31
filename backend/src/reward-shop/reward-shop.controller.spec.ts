import { Test, TestingModule } from '@nestjs/testing';
import { RewardShopController } from './reward-shop.controller';
import { RewardShopService } from './reward-shop.service';

describe('RewardShopController', () => {
  let controller: RewardShopController;
  let serviceMock: any;

  const mockItem = { id: 'item1', name: 'Chest', price: 100 };
  const mockPurchase = { id: 'p1', userId: 'u1', itemId: 'item1', pointsSpent: 100 };

  beforeEach(async () => {
    serviceMock = {
      listAvailableItems: jest.fn().mockReturnValue([mockItem]),
      getItemById: jest.fn().mockReturnValue(mockItem),
      purchaseItem: jest.fn().mockReturnValue(mockPurchase),
      getUserPoints: jest.fn().mockReturnValue(500),
      addPointsToUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RewardShopController],
      providers: [{ provide: RewardShopService, useValue: serviceMock }],
    }).compile();

    controller = module.get<RewardShopController>(RewardShopController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists items', () => {
    const res = controller.listItems({});
    expect(res).toEqual([mockItem]);
  });

  it('gets item by id', () => {
    const res = controller.getItemById('item1');
    expect(res).toEqual(mockItem);
  });

  it('purchases item', () => {
    const res = controller.purchaseItem({ userId: 'u1', itemId: 'item1' });
    expect(res).toEqual(mockPurchase);
  });

  it('gets user points', () => {
    const res = controller.getUserPoints('u1');
    expect(res).toEqual({ userId: 'u1', points: 500 });
  });

  it('adds points', () => {
    controller.addPoints('u1', 100);
    expect(serviceMock.addPointsToUser).toHaveBeenCalledWith('u1', 100);
  });
});
