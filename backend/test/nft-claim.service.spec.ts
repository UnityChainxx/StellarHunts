import { Test, TestingModule } from '@nestjs/testing';
import { NFTClaimService } from '../src/nft-claim/nft-claim.service';
import { StellarHandlerService } from '../src/nft-claim/providers/stellar-handler.service';
import { ClaimNFTDto } from '../src/nft-claim/dto/claim-nft.dto';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

// The repo's jest setup cannot execute the SDK's CJS build (ESM-only
// transitive deps), and this spec only exercises retry orchestration, so
// the SDK module is mocked wholesale.
jest.mock('@stellar/stellar-sdk', () => ({
  Contract: class {},
  TransactionBuilder: class {},
  Keypair: {
    fromSecret: jest.fn(),
    fromPublicKey: jest.fn(),
  },
  Networks: { TESTNET: 'Test SDF Network ; September 2015' },
  nativeToScVal: jest.fn(),
  rpc: { Server: class {}, Api: { GetTransactionStatus: {} } },
}));

describe('NFTClaimService', () => {
  // The retry path sleeps for real (2s + 4s backoff), exceeding jest's
  // 5s default for the max-retries test.
  jest.setTimeout(20_000);

  let service: NFTClaimService;
  let stellarHandler: StellarHandlerService;

  const mockClaimNFTDto: ClaimNFTDto = {
    userId: 'user123',
    nftId: 'nft456',
  };

  const mockStellarHandler = {
    claimNFT: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NFTClaimService,
        {
          provide: StellarHandlerService,
          useValue: mockStellarHandler,
        },
      ],
    }).compile();

    service = module.get<NFTClaimService>(NFTClaimService);
    stellarHandler = module.get<StellarHandlerService>(StellarHandlerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('claimNFT', () => {
    it('should successfully claim NFT on first attempt', async () => {
      const mockResult = { status: 'success', transactionId: 'tx789' };
      mockStellarHandler.claimNFT.mockResolvedValue(mockResult);

      const result = await service.claimNFT(mockClaimNFTDto);

      expect(result).toEqual(mockResult);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(1);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledWith(mockClaimNFTDto);
    });

    it('should retry on failure and succeed on subsequent attempt', async () => {
      const mockResult = { status: 'success', transactionId: 'tx789' };
      mockStellarHandler.claimNFT
        .mockRejectedValueOnce(new InternalServerErrorException('Network error'))
        .mockResolvedValue(mockResult);

      const result = await service.claimNFT(mockClaimNFTDto);

      expect(result).toEqual(mockResult);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(2);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledWith(mockClaimNFTDto);
    });

    it('should fail after max retries on persistent error', async () => {
      mockStellarHandler.claimNFT.mockRejectedValue(
        new InternalServerErrorException('Network error'),
      );

      await expect(service.claimNFT(mockClaimNFTDto)).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(3);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledWith(mockClaimNFTDto);
    });

    it('should throw BadRequestException immediately without retries', async () => {
      mockStellarHandler.claimNFT.mockRejectedValue(
        new BadRequestException('Invalid parameters'),
      );

      await expect(service.claimNFT(mockClaimNFTDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(1);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledWith(mockClaimNFTDto);
    });

    it('should return a pending claim immediately without retrying it (issue #486)', async () => {
      // A submitted-but-unconfirmed transaction must not be resubmitted by
      // the retry loop: the hash is already authoritative and a duplicate
      // signature risks a double mint.
      const pendingResult = {
        status: 'pending',
        transactionId: 'a'.repeat(64),
        userId: mockClaimNFTDto.userId,
        nftId: mockClaimNFTDto.nftId,
      };
      mockStellarHandler.claimNFT.mockResolvedValueOnce(pendingResult);

      const result = await service.claimNFT(mockClaimNFTDto);

      expect(result).toEqual(pendingResult);
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(1);
    });

    it('should surface permanent claim rejections as BadRequestException (issue #486)', async () => {
      mockStellarHandler.claimNFT.mockRejectedValue(
        new BadRequestException('Soroban transaction rejected: ...'),
      );

      await expect(service.claimNFT(mockClaimNFTDto)).rejects.toThrow(
        /Soroban transaction rejected/,
      );
      expect(mockStellarHandler.claimNFT).toHaveBeenCalledTimes(1);
    });
  });
});
