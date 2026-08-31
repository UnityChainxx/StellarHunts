import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { LinkWalletDto } from './dto/link-wallet.dto';

describe('UserService', () => {
  let service: UserService;
  let usersRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };

  const WALLET = '0xabc1234567890abc1234567890abc1234567890';

  beforeEach(async () => {
    usersRepo = {
      create: jest.fn((data) => ({ id: 'user-1', ...data })),
      save: jest.fn(async (data) => data),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: usersRepo,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('linkWallet', () => {
    it('links the wallet when it is not linked to any other account', async () => {
      const user = { id: 'user-1', walletAddress: null } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(undefined); // no existing wallet

      const result = await service.linkWallet('user-1', {
        walletAddress: WALLET,
      } as LinkWalletDto);

      expect(result.walletAddress).toBe(WALLET);
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('throws ConflictException when the wallet is linked to another account', async () => {
      const user = { id: 'user-1', walletAddress: null } as User;
      const other = { id: 'user-2', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(other); // wallet on other account

      await expect(
        service.linkWallet('user-1', { walletAddress: WALLET } as LinkWalletDto),
      ).rejects.toThrow(ConflictException);
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it('allows re-linking the same wallet to the same account', async () => {
      const user = { id: 'user-1', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById
      usersRepo.findOne.mockResolvedValueOnce(user); // existing wallet is the same account

      const result = await service.linkWallet('user-1', {
        walletAddress: WALLET,
      } as LinkWalletDto);

      expect(result.walletAddress).toBe(WALLET);
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValueOnce(undefined);

      await expect(
        service.linkWallet('missing', {
          walletAddress: WALLET,
        } as LinkWalletDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unlinkWallet', () => {
    it('clears the wallet address', async () => {
      const user = { id: 'user-1', walletAddress: WALLET } as User;
      usersRepo.findOne.mockResolvedValueOnce(user); // getUserById

      const result = await service.unlinkWallet('user-1');

      expect(result.walletAddress).toBeNull();
      expect(usersRepo.save).toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      usersRepo.findOne.mockResolvedValueOnce(undefined);

      await expect(service.unlinkWallet('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
