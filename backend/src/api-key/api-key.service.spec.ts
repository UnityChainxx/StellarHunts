import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiKeyService, ApiKeyStatus } from './api-key.service';

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeyService],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateApiKey', () => {
    it('generates a new API key for admin user', () => {
      const keyObj = service.generateApiKey('my-app', true);
      expect(keyObj.ownerLabel).toBe('my-app');
      expect(keyObj.status).toBe(ApiKeyStatus.ACTIVE);
      expect(service.validateApiKey(keyObj.key)).toBe(true);
    });

    it('throws UnauthorizedException if non-admin attempts generation', () => {
      expect(() => service.generateApiKey('my-app', false)).toThrow(UnauthorizedException);
    });

    it('throws BadRequestException if owner label is empty', () => {
      expect(() => service.generateApiKey('   ', true)).toThrow(BadRequestException);
    });
  });

  describe('revokeApiKey', () => {
    it('revokes an existing API key for admin', () => {
      const keyObj = service.generateApiKey('revoke-target', true);
      const revoked = service.revokeApiKey(keyObj.key, true);
      expect(revoked.status).toBe(ApiKeyStatus.REVOKED);
      expect(service.validateApiKey(keyObj.key)).toBe(false);
    });

    it('throws UnauthorizedException if non-admin attempts revocation', () => {
      expect(() => service.revokeApiKey('some-key', false)).toThrow(UnauthorizedException);
    });

    it('throws NotFoundException if key does not exist', () => {
      expect(() => service.revokeApiKey('non-existent-key', true)).toThrow(NotFoundException);
    });

    it('throws BadRequestException if key is already revoked', () => {
      const keyObj = service.generateApiKey('revoke-target', true);
      service.revokeApiKey(keyObj.key, true);
      expect(() => service.revokeApiKey(keyObj.key, true)).toThrow(BadRequestException);
    });
  });

  describe('validateApiKey', () => {
    it('returns false for expired keys', () => {
      const expiredKey = service.generateApiKey('expired-owner', true, new Date(Date.now() - 1000));
      expect(service.validateApiKey(expiredKey.key)).toBe(false);
    });

    it('returns false for unknown keys', () => {
      expect(service.validateApiKey('invalid-uuid')).toBe(false);
    });
  });

  describe('getAllApiKeys', () => {
    it('returns all keys for admin', () => {
      const keys = service.getAllApiKeys(true);
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it('throws UnauthorizedException for non-admin', () => {
      expect(() => service.getAllApiKeys(false)).toThrow(UnauthorizedException);
    });
  });
});
