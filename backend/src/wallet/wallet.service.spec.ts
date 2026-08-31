import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { ConsumedWalletNonce } from './entities/consumed-nonce.entity';

describe('WalletService (replay protection)', () => {
  let service: WalletService;
  let consumedNonceRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  const keypair = Keypair.random();
  const WALLET = keypair.publicKey();
  const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const DEFAULT_DOMAIN = 'stellar-hunts.app';

  const signMessage = (message: string) =>
    Buffer.from(keypair.sign(Buffer.from(message, 'utf8'))).toString('base64');

  beforeEach(async () => {
    consumedNonceRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((data) => ({ id: 'nonce-id', ...data })),
      save: jest.fn(async (data) => data),
    };

    const walletRepository = {
      findOne: jest.fn(async () => null),
      create: jest.fn((data) => ({ id: 'wallet-id', ...data })),
      save: jest.fn(async (data) => data),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet), useValue: walletRepository },
        {
          provide: getRepositoryToken(ConsumedWalletNonce),
          useValue: consumedNonceRepository,
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('accepts a valid freshly-signed challenge and consumes the nonce', async () => {
    const { message } = service.createChallenge(WALLET, undefined, DEFAULT_DOMAIN);
    const signature = signMessage(message);

    const result = await service.verifySignature(WALLET, signature, message);

    expect(result.valid).toBe(true);
    expect(consumedNonceRepository.save).toHaveBeenCalled();
  });

  it('rejects a replayed signature (nonce already consumed)', async () => {
    const { message } = service.createChallenge(WALLET, undefined, DEFAULT_DOMAIN);
    const signature = signMessage(message);

    await service.verifySignature(WALLET, signature, message);

    // Second attempt: nonce now consumed.
    consumedNonceRepository.findOne.mockResolvedValueOnce({ id: 'x' });

    const result = await service.verifySignature(WALLET, signature, message);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('replay');
  });

  it('rejects a challenge bound to another user (cross-user)', async () => {
    const { message } = service.createChallenge(WALLET, USER_A, DEFAULT_DOMAIN);
    const signature = signMessage(message);

    const result = await service.verifySignature(WALLET, signature, message, {
      userId: USER_B,
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('user');
  });

  it('accepts a challenge when user binding matches', async () => {
    const { message } = service.createChallenge(WALLET, USER_A, DEFAULT_DOMAIN);
    const signature = signMessage(message);

    const result = await service.verifySignature(WALLET, signature, message, {
      userId: USER_A,
    });

    expect(result.valid).toBe(true);
  });

  it('rejects an expired challenge', async () => {
    const challenge = service.createChallenge(WALLET, undefined, DEFAULT_DOMAIN, -10);
    const signature = signMessage(challenge.message);

    const result = await service.verifySignature(
      WALLET,
      signature,
      challenge.message,
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('rejects a challenge bound to a different domain (wrong-domain)', async () => {
    const { message } = service.createChallenge(
      WALLET,
      undefined,
      'evil.example.com',
    );
    const signature = signMessage(message);

    const result = await service.verifySignature(
      WALLET,
      signature,
      message,
      { domain: DEFAULT_DOMAIN },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('domain');
  });

  it('rejects a message not bound to the presented wallet', async () => {
    const other = Keypair.random();
    const { message } = service.createChallenge(
      WALLET,
      undefined,
      DEFAULT_DOMAIN,
    );
    // Sign with a different key than the one presented.
    const signature = Buffer.from(
      other.sign(Buffer.from(message, 'utf8')),
    ).toString('base64');

    const result = await service.verifySignature(WALLET, signature, message);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('signature');
  });

  it('rejects a malformed challenge message', async () => {
    const result = await service.verifySignature(
      WALLET,
      signMessage('hello'),
      'hello',
    );

    expect(result.valid).toBe(false);
  });
});