import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { VerificationService } from './verification.service';
import type { JwtPayload, WalletTokenPayload, TokenValidationResult } from '../interfaces/token.interface';

describe('VerificationService', () => {
  let service: VerificationService;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  const mockJwtPayload: JwtPayload = {
    sub: 'user-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  beforeEach(async () => {
    jwtService = {
      verify: jest.fn(),
      sign: jest.fn(),
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
  });

  describe('validateJwtToken', () => {
    it('returns valid result for a valid JWT token', async () => {
      jwtService.verify.mockReturnValue(mockJwtPayload);

      const result = await service.validateJwtToken('valid.jwt.token');

      expect(result.isValid).toBe(true);
      expect(result.payload).toEqual(mockJwtPayload);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid result for an expired token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const result = await service.validateJwtToken('expired.token');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('jwt expired');
      expect(result.payload).toBeUndefined();
    });

    it('returns invalid result for a malformed token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      const result = await service.validateJwtToken('bad');

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('invalid token');
    });

    it('passes ignoreExpiration option to jwtService', async () => {
      jwtService.verify.mockReturnValue(mockJwtPayload);

      await service.validateJwtToken('test.token', { ignoreExpiration: true });

      expect(jwtService.verify).toHaveBeenCalledWith('test.token', {
        ignoreExpiration: true,
        audience: undefined,
        issuer: undefined,
      });
    });

    it('passes audience and issuer options', async () => {
      jwtService.verify.mockReturnValue(mockJwtPayload);

      await service.validateJwtToken('test.token', {
        audience: 'myapp',
        issuer: 'auth-stellar',
      });

      expect(jwtService.verify).toHaveBeenCalledWith('test.token', {
        ignoreExpiration: false,
        audience: 'myapp',
        issuer: 'auth-stellar',
      });
    });

    it('returns expiresAt from payload exp', async () => {
      jwtService.verify.mockReturnValue(mockJwtPayload);

      const result = await service.validateJwtToken('valid.token');

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.getTime()).toBe(mockJwtPayload.exp! * 1000);
    });

    it('handles payload without exp field', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-123' });

      const result = await service.validateJwtToken('no-exp.token');

      expect(result.isValid).toBe(true);
      expect(result.expiresAt).toBeUndefined();
    });
  });

  describe('validateWalletToken', () => {
    const validPayload: WalletTokenPayload = {
      address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      signature: '0xvalid_signature',
      message: 'test message',
      timestamp: Date.now(),
    };

    it('validates a correct wallet signature', async () => {
      const result = await service.validateWalletToken({
        ...validPayload,
        address: '0xRecoveredAddress',
      });

      expect(result.isValid).toBe(true);
    });

    it('returns expired if timestamp exceeds maxAge', async () => {
      const result = await service.validateWalletToken(
        { ...validPayload, timestamp: Date.now() - 100000 },
        { maxAge: 5000 },
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Token has expired');
    });

    it('returns invalid for mismatched message', async () => {
      const result = await service.validateWalletToken(validPayload, {
        requiredMessage: 'different message',
      });

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid message');
    });

    it('returns invalid if signature recovery fails', async () => {
      const ethers = require('ethers');
      jest.spyOn(ethers.utils, 'verifyMessage').mockImplementationOnce(() => {
        throw new Error('signature error');
      });

      const result = await service.validateWalletToken(validPayload);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('signature error');
    });

    it('computes expiresAt when maxAge is set', async () => {
      const timestamp = Date.now();
      const result = await service.validateWalletToken(
        {
          ...validPayload,
          address: '0xRecoveredAddress',
          timestamp,
        },
        { maxAge: 60000 },
      );

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.getTime()).toBe(timestamp + 60000);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('extracts Bearer token from header', () => {
      const result = service.extractTokenFromHeader('Bearer mytoken123');

      expect(result).toBe('mytoken123');
    });

    it('returns null for non-Bearer header', () => {
      const result = service.extractTokenFromHeader('Basic abcdef');

      expect(result).toBeNull();
    });

    it('returns null for empty header', () => {
      const result = service.extractTokenFromHeader('');

      expect(result).toBeNull();
    });

    it('returns null for null header', () => {
      const result = service.extractTokenFromHeader(null as unknown as string);

      expect(result).toBeNull();
    });
  });

  describe('generateNonce', () => {
    it('generates a 64-character hex string', () => {
      const nonce = service.generateNonce();

      expect(nonce).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(nonce)).toBe(true);
    });

    it('generates unique values on successive calls', () => {
      const nonce1 = service.generateNonce();
      const nonce2 = service.generateNonce();

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('createWalletMessage', () => {
    it('includes address and nonce in the message', () => {
      const message = service.createWalletMessage(
        '0x123',
        'abc123',
      );

      expect(message).toContain('0x123');
      expect(message).toContain('abc123');
    });

    it('uses provided timestamp', () => {
      const message = service.createWalletMessage(
        '0x123',
        'nonce',
        99999,
      );

      expect(message).toContain('99999');
    });
  });

  describe('isValidTokenFormat', () => {
    it('returns true for a 3-part token', () => {
      expect(service.isValidTokenFormat('header.payload.sig')).toBe(true);
    });

    it('returns false for a 2-part string', () => {
      expect(service.isValidTokenFormat('header.payload')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(service.isValidTokenFormat('')).toBe(false);
    });

    it('returns false for null', () => {
      expect(service.isValidTokenFormat(null as unknown as string)).toBe(false);
    });
  });
});
