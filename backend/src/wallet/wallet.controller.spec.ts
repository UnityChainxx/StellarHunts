import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  let controller: WalletController;

  const mockService = {
    linkWallet: jest.fn(async (address: string) => ({ id: '1', address })),
    createChallenge: jest.fn(),
    verifySignature: jest.fn(),
  } as {
    linkWallet: jest.Mock;
    createChallenge: jest.Mock;
    verifySignature: jest.Mock;
  };

  beforeEach(async () => {
    mockService.verifySignature.mockReset().mockResolvedValue({ valid: true });
    mockService.createChallenge.mockReset();
    mockService.linkWallet.mockReset().mockImplementation(async (address: string) => ({ id: '1', address }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        {
          provide: WalletService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should link wallet', async () => {
    const result = await controller.linkWallet({ address: 'G123' });
    expect(result.address).toBe('G123');
  });

  it('should create a challenge', async () => {
    mockService.createChallenge.mockResolvedValueOnce({
      message: 'challenge-msg',
      nonce: 'n',
      expiresAt: new Date(),
    });

    const result = await controller.createChallenge({
      walletAddress: 'G123',
    });

    expect(mockService.createChallenge).toHaveBeenCalledWith(
      'G123',
      undefined,
      undefined,
      undefined,
    );
    expect(result.message).toBe('challenge-msg');
  });

  it('should verify signature (POST)', async () => {
    const result = await controller.verifySignature({
      walletAddress: 'G123',
      signature: 'sig',
      message: 'msg',
    });
    expect(result.valid).toBe(true);
  });

  it('should verify signature (GET)', async () => {
    mockService.verifySignature.mockResolvedValueOnce({ valid: false, error: 'x' });
    const result = await controller.verifySignatureGet('G123', 'sig', 'msg');
    expect(result.valid).toBe(false);
  });
});