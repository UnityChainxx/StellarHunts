import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}

export interface ApiKey {
  key: string;
  ownerLabel: string;
  status: ApiKeyStatus;
  createdAt: Date;
  expiresAt?: Date;
  monthlyRequestQuota: number;
  rateLimitPerMinute: number;
  requestsThisMonth: number;
  scopedEndpoints: string[];
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  private apiKeys = new Map<string, ApiKey>();

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

    const newKey = uuidv4();
    const apiKey: ApiKey = {
      key: newKey,
      ownerLabel,
      status: ApiKeyStatus.ACTIVE,
      createdAt: new Date(),
      expiresAt,
      monthlyRequestQuota,
      rateLimitPerMinute,
      requestsThisMonth: 0,
      scopedEndpoints,
    };
    this.apiKeys.set(newKey, apiKey);
    this.logger.log(`Generated new API key for ${ownerLabel}: ${newKey}`);
    return apiKey;
  }

  checkQuota(key: string): boolean {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) return false;
    return apiKey.requestsThisMonth < apiKey.monthlyRequestQuota;
  }

  incrementRequestCount(key: string): void {
    const apiKey = this.apiKeys.get(key);
    if (apiKey) {
      apiKey.requestsThisMonth += 1;
      this.apiKeys.set(key, apiKey);
    }
  }

  getQuotaUsage(key: string): {
    used: number;
    limit: number;
    remaining: number;
  } {
    const apiKey = this.apiKeys.get(key);
    if (!apiKey) {
      return { used: 0, limit: 0, remaining: 0 };
    }
    return {
      used: apiKey.requestsThisMonth,
      limit: apiKey.monthlyRequestQuota,
      remaining: Math.max(
        0,
        apiKey.monthlyRequestQuota - apiKey.requestsThisMonth,
      ),
    };
  }

  revokeApiKey(key: string, isAdmin: boolean): ApiKey {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can revoke API keys.',
      );
    }

    const apiKey = this.apiKeys.get(key);
    if (!apiKey) {
      throw new NotFoundException(`API Key "${key}" not found.`);
    }
    if (apiKey.status === ApiKeyStatus.REVOKED) {
      throw new BadRequestException(`API Key "${key}" is already revoked.`);
    }

    apiKey.status = ApiKeyStatus.REVOKED;
    this.apiKeys.set(key, apiKey);
    this.logger.log(`API Key "${key}" revoked.`);
    return apiKey;
  }

  validateApiKey(key: string): boolean {
    this.logger.log(`Validating API Key: ${key}`);
    const apiKey = this.apiKeys.get(key);

    if (!apiKey) {
      this.logger.warn(`API Key "${key}" not found.`);
      return false;
    }
    if (apiKey.status === ApiKeyStatus.REVOKED) {
      this.logger.warn(`API Key "${key}" is revoked.`);
      return false;
    }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      this.logger.warn(`API Key "${key}" has expired.`);
      return false;
    }

    this.logger.log(`API Key "${key}" is valid.`);
    return true;
  }

  getAllApiKeys(isAdmin: boolean): ApiKey[] {
    if (!isAdmin) {
      throw new UnauthorizedException(
        'Only administrators can view all API keys.',
      );
    }
    return Array.from(this.apiKeys.values());
  }
}
