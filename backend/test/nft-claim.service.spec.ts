import { Test, TestingModule } from '@nestjs/testing';
import { NFTClaimService } from '../src/nft-claim/nft-claim.service';
import { StellarHandlerService } from '../src/nft-claim/providers/stellar-handler.service';
import { ClaimNFTDto } from '../src/nft-claim/dto/claim-nft.dto';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('NFTClaimService', () => {
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
  });
});
