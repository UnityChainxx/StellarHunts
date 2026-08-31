import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiKeyService,
  ApiKeyStatus,
  hashApiKey,
  constantTimeEqual,
} from './api-key.service';

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
      expect(() => service.generateApiKey('my-app', false)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws BadRequestException if owner label is empty', () => {
      expect(() => service.generateApiKey('   ', true)).toThrow(
        BadRequestException,
      );
    });

    it('never persists the raw secret — only a hash and a display hint', () => {
      const keyObj = service.generateApiKey('hash-me', true);
      const stored = service.getAllApiKeys(true);
      const record = stored.find((r) => r.keyHash === hashApiKey(keyObj.key));

      expect(record).toBeDefined();
      expect(record!.keyHint).toBe(keyObj.key.slice(-4));
      // The raw key must not appear anywhere in stored records.
      for (const r of stored) {
        expect(JSON.stringify(r)).not.toContain(keyObj.key);
        expect(r.keyHash).not.toBe(keyObj.key);
      }
      expect(hashApiKey(keyObj.key)).not.toBe(keyObj.key);
    });

    it('generates unique raw secrets', () => {
      const a = service.generateApiKey('a', true);
      const b = service.generateApiKey('b', true);
      expect(a.key).not.toBe(b.key);
    });
  });

  describe('constant-time verification', () => {
    it('accepts a matching digest', () => {
      const key = 'sh_secret-value';
      expect(constantTimeEqual(hashApiKey(key), hashApiKey(key))).toBe(true);
    });

    it('rejects a different digest', () => {
      expect(
        constantTimeEqual(hashApiKey('sh_one'), hashApiKey('sh_two')),
      ).toBe(false);
    });

    it('rejects inputs of different lengths without throwing', () => {
      expect(constantTimeEqual('a', 'bb')).toBe(false);
    });

    it('rejects a tampered key during validation', () => {
      const keyObj = service.generateApiKey('tamper', true);
      const tampered = `${keyObj.key.slice(0, -1)}x`;
      expect(service.validateApiKey(tampered)).toBe(false);
      expect(service.validateApiKey(keyObj.key)).toBe(true);
    });
  });

  describe('scope enforcement', () => {
    it('allows an unscoped key on any endpoint', () => {
      const keyObj = service.generateApiKey('unscoped', true);
      expect(service.validateApiKey(keyObj.key, '/anything')).toBe(true);
    });

    it('allows a scoped key only on its permitted endpoints', () => {
      const keyObj = service.generateApiKey('scoped', true, undefined, 1000, 100, [
        '/api-keys/protected',
      ]);
      expect(service.validateApiKey(keyObj.key, '/api-keys/protected')).toBe(
        true,
      );
      expect(service.validateApiKey(keyObj.key, '/api-keys/protected/x')).toBe(
        true,
      );
      expect(service.validateApiKey(keyObj.key, '/other/route')).toBe(false);
    });

    it('supports wildcard scopes', () => {
      const keyObj = service.generateApiKey('wildcard', true, undefined, 1000, 100, [
        '/puzzles/*',
      ]);
      expect(service.validateApiKey(keyObj.key, '/puzzles')).toBe(true);
      expect(service.validateApiKey(keyObj.key, '/puzzles/42')).toBe(true);
      expect(service.validateApiKey(keyObj.key, '/users/1')).toBe(false);
    });
  });

  describe('rotateApiKey', () => {
    it('invalidates the old secret and issues a new one', () => {
      const keyObj = service.generateApiKey('rotate-me', true);
      expect(service.validateApiKey(keyObj.key)).toBe(true);

      const rotated = service.rotateApiKey(keyObj.key, true);
      expect(rotated.key).not.toBe(keyObj.key);
      expect(rotated.ownerLabel).toBe('rotate-me');
      expect(service.validateApiKey(keyObj.key)).toBe(false);
      expect(service.validateApiKey(rotated.key)).toBe(true);
    });

    it('preserves metadata (quota, scopes) across rotation', () => {
      const keyObj = service.generateApiKey('rotate-meta', true, undefined, 500, 50, [
        '/api-keys/protected',
      ]);
      const rotated = service.rotateApiKey(keyObj.key, true);
      expect(rotated.monthlyRequestQuota).toBe(500);
      expect(rotated.rateLimitPerMinute).toBe(50);
      expect(rotated.scopedEndpoints).toEqual(['/api-keys/protected']);
    });

    it('throws UnauthorizedException if non-admin attempts rotation', () => {
      const keyObj = service.generateApiKey('rotate-no', true);
      expect(() => service.rotateApiKey(keyObj.key, false)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws NotFoundException for an unknown key', () => {
      expect(() => service.rotateApiKey('sh_unknown', true)).toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when rotating a revoked key', () => {
      const keyObj = service.generateApiKey('rotate-revoked', true);
      service.revokeApiKey(keyObj.key, true);
      expect(() => service.rotateApiKey(keyObj.key, true)).toThrow(
        BadRequestException,
      );
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
      expect(() => service.revokeApiKey('some-key', false)).toThrow(
        UnauthorizedException,
      );
    });

    it('throws NotFoundException if key does not exist', () => {
      expect(() => service.revokeApiKey('non-existent-key', true)).toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if key is already revoked', () => {
      const keyObj = service.generateApiKey('revoke-target', true);
      service.revokeApiKey(keyObj.key, true);
      expect(() => service.revokeApiKey(keyObj.key, true)).toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateApiKey', () => {
    it('returns false for expired keys', () => {
      const expiredKey = service.generateApiKey(
        'expired-owner',
        true,
        new Date(Date.now() - 1000),
      );
      expect(service.validateApiKey(expiredKey.key)).toBe(false);
    });

    it('returns false for unknown keys', () => {
      expect(service.validateApiKey('sh_invalid')).toBe(false);
    });
  });

  describe('getAllApiKeys', () => {
    it('returns all keys for admin', () => {
      const keys = service.getAllApiKeys(true);
      expect(keys.length).toBeGreaterThanOrEqual(2);
    });

    it('never exposes raw secrets in listings', () => {
      const keys = service.getAllApiKeys(true);
      for (const k of keys) {
        expect((k as any).key).toBeUndefined();
        expect(k.keyHash).toBeDefined();
        expect(k.keyHint).toBeDefined();
      }
    });

    it('throws UnauthorizedException for non-admin', () => {
      expect(() => service.getAllApiKeys(false)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
