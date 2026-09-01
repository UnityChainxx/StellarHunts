import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY } from './rate-limit.guard';
import type { RateLimitConfig } from './rate-limit.interface';

export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);
