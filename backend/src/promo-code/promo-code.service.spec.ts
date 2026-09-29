import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PromoCodeService } from './promo-code.service';
import { PromoCode } from './promo-code.entity';
import { PromoCodeRedemption } from './entities/promo-code-redemption.entity';
import { User } from '../auth/entities/user.entity';

describe('PromoCodeService', () => {
  let service: PromoCodeService;

  const mockPromoCodeRepo = {
    findOne: jest.fn(),
  };
  const mockRedemptionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockUserRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromoCodeService,
        { provide: getRepositoryToken(PromoCode), useValue: mockPromoCodeRepo },
        {
          provide: getRepositoryToken(PromoCodeRedemption),
          useValue: mockRedemptionRepo,
        },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
      ],
    }).compile();

    service = module.get<PromoCodeService>(PromoCodeService);
  });

  it('throws NotFoundException when promo code does not exist', async () => {
    mockPromoCodeRepo.findOne.mockResolvedValue(null);
    await expect(service.redeem('INVALID', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when promo code is expired', async () => {
    const pastDate = new Date(Date.now() - 1000);
    mockPromoCodeRepo.findOne.mockResolvedValue({
      id: 'promo-1',
      code: 'EXPIRED',
      expiresAt: pastDate,
    });
    await expect(service.redeem('EXPIRED', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when user does not exist', async () => {
    mockPromoCodeRepo.findOne.mockResolvedValue({
      id: 'promo-1',
      code: 'VALID10',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    mockUserRepo.findOne.mockResolvedValue(null);
    await expect(service.redeem('VALID10', 'ghost-user')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when promo code already redeemed by user', async () => {
    mockPromoCodeRepo.findOne.mockResolvedValue({
      id: 'promo-1',
      code: 'VALID10',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    mockUserRepo.findOne.mockResolvedValue({ id: 'user-1' });
    mockRedemptionRepo.findOne.mockResolvedValue({ id: 'redemption-1' });
    await expect(service.redeem('VALID10', 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('redeems a valid promo code successfully', async () => {
    const promo = {
      id: 'promo-1',
      code: 'VALID10',
      expiresAt: new Date(Date.now() + 3600_000),
    };
    const user = { id: 'user-1' };
    const redemption = { id: 'redemption-new', promoCode: promo, user };
    mockPromoCodeRepo.findOne.mockResolvedValue(promo);
    mockUserRepo.findOne.mockResolvedValue(user);
    mockRedemptionRepo.findOne.mockResolvedValue(null);
    mockRedemptionRepo.create.mockReturnValue(redemption);
    mockRedemptionRepo.save.mockResolvedValue(redemption);

    const result = await service.redeem('VALID10', 'user-1');
    expect(result).toEqual({ message: 'Promo code redeemed successfully' });
    expect(mockRedemptionRepo.save).toHaveBeenCalledWith(redemption);
  });
});
