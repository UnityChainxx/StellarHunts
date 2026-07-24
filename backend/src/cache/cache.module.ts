import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule, RedisOptions } from '@nestjs-modules/ioredis';
import { CacheService } from './cache.service';

/**
 * CacheModule
 * -----------
 * Backed by Redis via `@nestjs-modules/ioredis`. Provides a single
 * {@link CacheService} that other modules can inject for `getOrSet`
 * semantics + single-flight coalescing (#107).
 *
 * Marked `@Global()` so other feature modules (Streak, Analytics, ...)
 * don't have to re-import it to use `CacheService`.
 */
@Global()
@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RedisOptions => {
        const host = configService.get<string>('cache.redisHost') || process.env.REDIS_HOST || 'localhost';
        const port = Number(configService.get<string>('cache.redisPort') || process.env.REDIS_PORT || 6379);
        const password = configService.get<string>('cache.redisPassword') || process.env.REDIS_PASSWORD;
        const db = Number(configService.get<string>('cache.redisDb') || process.env.REDIS_DB || 0);
        const url = process.env.REDIS_URL;

        return {
          type: 'single',
          url,
          host: url ? undefined : host,
          port: url ? undefined : port,
          password,
          db,
          // Lazy connect so the app can boot even when Redis is temporarily
          // unavailable; the cache becomes a no-op and reads fall through
          // to the loader (#107). Subsequent requests will reconnect.
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
        };
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService, RedisModule],
})
export class CacheModule {}
