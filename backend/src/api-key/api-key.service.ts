import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

/** A stored API key record. Never contains the raw secret. */
export interface ApiKeyRecord {
  /** SHA-256 hex digest of the raw secret — the only thing persisted. */
  keyHash: string;
  /** Last 4 characters of the raw secret, for display/identification. */
  keyHint: string;
  ownerLabel: string;
  status: ApiKeyStatus;
  createdAt: Date;
  expiresAt?: Date;
  monthlyRequestQuota: number;
  rateLimitPerMinute: number;
  requestsThisMonth: number;
  scopedEndpoints: string[];
}

/** What `generate`/`rotate` return: the record plus the raw secret (once). */
export interface ApiKey extends ApiKeyRecord {
  key: string;
}

/**
 * SHA-256 the raw key. The digest (never the raw key) is what is stored and
 * what lookups compare against.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex digests. Used when verifying a
 * presented key against its stored hash so timing does not leak how close
 * an attacker's guess is.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function generateRawKey(): string {
  return `sh_${randomBytes(24).toString('hex')}`;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  /** keyHash -> record. Raw secrets are never stored. */
  private apiKeys = new Map<string, ApiKeyRecord>();

  constructor() {
    this.seedData();
  }

  private seedData(): void {
    this.logger.log('Seeding initial API key data...');
    this.generateApiKey(
      'admin-key-owner',
      true,
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    ); // Valid for 1 year
    this.generateApiKey('test-key-owner', true); // No expiration
    this.logger.log(`Seeded ${this.apiKeys.size} API keys.`);
  }

  generateApiKey(
    ownerLabel: string,
    isAdmin: boolean,
    expiresAt?: Date,
    monthlyRequestQuota = 1000,
    rateLimitPerMinute = 100,
    scopedEndpoints: string[] = [],
  ): ApiKey {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can generate API keys.',
      );
    }
    if (!ownerLabel || ownerLabel.trim().length === 0) {
      throw new BadRequestException('Owner label cannot be empty.');
    }

    const rawKey = generateRawKey();
    const record: ApiKeyRecord = {
      keyHash: hashApiKey(rawKey),
      keyHint: rawKey.slice(-4),
      ownerLabel: ownerLabel.trim(),
      status: ApiKeyStatus.ACTIVE,
      createdAt: new Date(),
      expiresAt,
      monthlyRequestQuota,
      rateLimitPerMinute,
      requestsThisMonth: 0,
      scopedEndpoints,
    };
    this.apiKeys.set(record.keyHash, record);
    // Never log the raw secret — only the display hint.
    this.logger.log(
      `Generated new API key for ${record.ownerLabel} (hint: ...${record.keyHint})`,
    );
    // The raw secret is returned exactly once, at creation time.
    return { ...record, key: rawKey };
  }

  /**
   * Rotation: mints a fresh secret for an existing key while preserving its
   * metadata (owner, quota, scopes). The old secret stops working
   * immediately because the stored hash is replaced.
   */
  rotateApiKey(key: string, isAdmin: boolean): ApiKey {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can rotate API keys.',
      );
    }

    const record = this.findRecordByKey(key);
    if (!record) {
      throw new NotFoundException(`API Key not found.`);
    }
    if (record.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException(
        'Cannot rotate a revoked API key. Generate a new one instead.',
      );
    }

    const newRawKey = generateRawKey();
    const rotated: ApiKeyRecord = {
      ...record,
      keyHash: hashApiKey(newRawKey),
      keyHint: newRawKey.slice(-4),
    };
    this.apiKeys.delete(record.keyHash);
    this.apiKeys.set(rotated.keyHash, rotated);
    this.logger.log(`Rotated API key for ${rotated.ownerLabel}`);
    return { ...rotated, key: newRawKey };
  }

  checkQuota(key: string): boolean {
    const record = this.findRecordByKey(key);
    if (!record) return false;
    return record.requestsThisMonth < record.monthlyRequestQuota;
  }

  incrementRequestCount(key: string): void {
    const record = this.findRecordByKey(key);
    if (record) {
      record.requestsThisMonth += 1;
      this.apiKeys.set(record.keyHash, record);
    }
  }

  getQuotaUsage(key: string): {
    used: number;
    limit: number;
    remaining: number;
  } {
    const record = this.findRecordByKey(key);
    if (!record) {
      return { used: 0, limit: 0, remaining: 0 };
    }
    return {
      used: record.requestsThisMonth,
      limit: record.monthlyRequestQuota,
      remaining: Math.max(0, record.monthlyRequestQuota - record.requestsThisMonth),
    };
  }

  revokeApiKey(key: string, isAdmin: boolean): ApiKeyRecord {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can revoke API keys.',
      );
    }

    const record = this.findRecordByKey(key);
    if (!record) {
      throw new NotFoundException(`API Key not found.`);
    }
    if (record.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException(`API Key is already revoked.`);
    }

    record.status = ApiKeyStatus.REVOKED;
    this.apiKeys.set(record.keyHash, record);
    this.logger.log(`API Key revoked (owner: ${record.ownerLabel}).`);
    return record;
  }

  /**
   * Verifies a presented key in constant time against its stored hash and
   * enforces status/expiry/scope. `endpoint` (e.g. the request route path)
   * is optional; when provided, keys with `scopedEndpoints` must cover it.
   */
  validateApiKey(key: string, endpoint?: string): boolean {
    const hash = hashApiKey(key);
    const record = this.apiKeys.get(hash);

    if (!record) {
      this.logger.warn(`API key validation failed (hint: ...${key.slice(-4)}).`);
      return false;
    }
    // Constant-time comparison of the digest against the stored hash.
    if (!constantTimeEqual(hash, record.keyHash)) {
      this.logger.warn(`API key hash mismatch (hint: ...${record.keyHint}).`);
      return false;
    }
    if (record.status === ApiKeyStatus.REVOKED) {
      this.logger.warn(`API key is revoked (hint: ...${record.keyHint}).`);
      return false;
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      this.logger.warn(`API key has expired (hint: ...${record.keyHint}).`);
      return false;
    }
    if (endpoint && !this.isEndpointAllowed(record, endpoint)) {
      this.logger.warn(
        `API key not allowed for endpoint ${endpoint} (hint: ...${record.keyHint}).`,
      );
      return false;
    }

    this.logger.log(`API key is valid (hint: ...${record.keyHint}).`);
    return true;
  }

  /** Returns stored records only — raw secrets are never exposed again. */
  getAllApiKeys(isAdmin: boolean): ApiKeyRecord[] {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can view all API keys.',
      );
    }
    return Array.from(this.apiKeys.values());
  }

  private findRecordByKey(key: string): ApiKeyRecord | undefined {
    return this.apiKeys.get(hashApiKey(key));
  }

  private isEndpointAllowed(record: ApiKeyRecord, endpoint: string): boolean {
    if (!record.scopedEndpoints || record.scopedEndpoints.length === 0) {
      return true; // unscoped keys may call any endpoint
    }
    return record.scopedEndpoints.some((allowed) => {
      if (allowed === '*') return true;
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1); // e.g. '/puzzles/'
        const base = prefix.replace(/\/+$/, ''); // e.g. '/puzzles'
        return endpoint === base || endpoint.startsWith(prefix);
      }
      return endpoint === allowed || endpoint.startsWith(`${allowed}/`);
    });
  }
}
