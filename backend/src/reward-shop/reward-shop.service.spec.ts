import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RewardShopService } from './reward-shop.service';

describe('RewardShopService', () => {
  let service: RewardShopService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RewardShopService],
    }).compile();

    service = module.get<RewardShopService>(RewardShopService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists items with filtering', () => {
    const all = service.listAvailableItems();
    expect(all.length).toBeGreaterThan(0);

    const chests = service.listAvailableItems('Chest');
    expect(chests.every((i) => i.category.toLowerCase() === 'chest')).toBe(true);

    const filteredPrice = service.listAvailableItems(undefined, 50, 100);
    expect(filteredPrice.every((i) => i.price >= 50 && i.price <= 100)).toBe(true);
  });

  it('gets item by id or throws NotFoundException', () => {
    const item = service.getItemById('item1');
    expect(item.name).toBe('Bronze Chest');

    expect(() => service.getItemById('non-existent')).toThrow(NotFoundException);
  });

  it('purchases item when user has sufficient points and stock is available', () => {
    const purchase = service.purchaseItem('userA', 'item1');
    expect(purchase.itemName).toBe('Bronze Chest');
    expect(service.getUserPoints('userA')).toBe(900);
  });

  it('throws BadRequestException if user has insufficient points', () => {
    expect(() => service.purchaseItem('userC', 'item1')).toThrow(BadRequestException);
  });

  it('adds points to user', () => {
    service.addPointsToUser('userC', 500);
    expect(service.getUserPoints('userC')).toBe(550);
  });
});
