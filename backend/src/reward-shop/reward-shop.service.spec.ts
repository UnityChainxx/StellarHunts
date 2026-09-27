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
    // UUID v4 format
    expect(purchase.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(purchase.referenceId).toMatch(/^purchase-[0-9a-f]{12}$/i);
  });

  it('guarantees idempotency on retried purchase request with same idempotencyKey', () => {
    const idempotencyKey = 'unique-tx-key-12345';
    const initialPoints = service.getUserPoints('userA');
    const initialStock = service.getItemById('item1').stock;

    const firstPurchase = service.purchaseItem(
      'userA',
      'item1',
      idempotencyKey,
    );
    expect(firstPurchase).toBeDefined();
    expect(service.getUserPoints('userA')).toBe(initialPoints - 100);
    expect(service.getItemById('item1').stock).toBe(initialStock - 1);

    // Retrying with the same idempotencyKey must return the exact same purchase record
    const retriedPurchase = service.purchaseItem(
      'userA',
      'item1',
      idempotencyKey,
    );
    expect(retriedPurchase.id).toBe(firstPurchase.id);
    expect(retriedPurchase.purchaseDate).toEqual(firstPurchase.purchaseDate);

    // Idempotency: points and stock are not deducted a second time
    expect(service.getUserPoints('userA')).toBe(initialPoints - 100);
    expect(service.getItemById('item1').stock).toBe(initialStock - 1);
  });

  it('preserves readability of existing legacy purchase records', () => {
    const legacy = service.getPurchaseById('purchase-1700000000000-legacy01');
    expect(legacy).toBeDefined();
    expect(legacy.userId).toBe('userA');
    expect(legacy.itemName).toBe('Bronze Chest');
  });

  it('throws BadRequestException if user has insufficient points', () => {
    expect(() => service.purchaseItem('userC', 'item1')).toThrow(BadRequestException);
  });

  it('adds points to user', () => {
    service.addPointsToUser('userC', 500);
    expect(service.getUserPoints('userC')).toBe(550);
  });
});
