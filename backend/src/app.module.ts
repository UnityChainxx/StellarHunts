import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import * as Joi from 'joi';

import appConfig from 'config/app.config';
import databaseConfig from 'config/database.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GracefulShutdownService } from './graceful-shutdown.service';

import { AchievementModule } from './achievement/achievement.module';
import { ActivityModule } from './activity/activity.module';
import { AnalyticModule } from './analytic/analytic.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { ContentModule } from './content/content.module';
import { ContentRatingModule } from './content-rating/content-rating.module';
import { DailyRewardModule } from './daily-reward/daily-reward.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GeoStatsModule } from './geostat/geostat.module';
import { HealthModule } from './health/health.module';
import { HintModule } from './hint/hint.module';
import { InAppNotificationsModule } from './in-app-notifications/in-app-notifications.module';
import { MaintenanceModeModule } from './maintenance-mode/maintenance-mode.module';
import { MigrationModule } from './migration/migration.module';
import { MilestoneModule } from './milestone/milestone.module';
import { MultiplayerQueueModule } from './multiplayer-queue/multiplayer-queue.module';
import { NFTClaimModule } from './nft-claim/nft-claim.module';
import { NftMarketplaceStubModule } from './nft-marketplace-stub/nft-marketplace-stub.module';
import { OutboxModule } from './outbox/outbox.module';
import { ProgressModule } from './progress/progress.module';
import { PromoCodeModule } from './promo-code/entities/promo-code.module';
import { PuzzleAccessLogModule } from './puzzle-access-log/puzzle-access-log.module';
import { PuzzleCategoryModule } from './puzzle-category/puzzle-category.module';
import { PuzzleCommentModule } from './puzzle-comment/puzzle-comment.module';
import { PuzzleDependencyModule } from './puzzle-dependency/puzzle-dependency.module';
import { PuzzleDraftModule } from './puzzle-draft/puzzle-draft.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { PuzzleReviewModule } from './puzzle-review/puzzle-review/puzzle-review.module';
import { PuzzleSubmissionModule } from './puzzle-submission/puzzle-submission.module';
import { PuzzleTranslationModule } from './puzzle-translation/puzzle-translation.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { ReferralModule } from './referral/referral.module';
import { ReportsModule } from './report/report.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { RewardsModule } from './reward/reward.module';
import { StreakModule } from './streak/streak.module';
import { TimeTrialModule } from './time-trial/time-trial.module';
import { TokenVerificationModule } from './token-verification/token-verification.module';
import { UserActivityLogModule } from './user-activity-log/user-activity-log.module';
import { UserInventoryModule } from './user-inventory/user-inventory.module';
import { UserModule } from './user/user.module';
import { UserRankingModule } from './user-ranking/user-ranking.module';
import { UserReactionModule } from './user-reaction/user-reaction.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig],
      cache: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().port().default(3001),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
        FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().port().default(5432),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        STELLAR_MODE: Joi.string().valid('mock', 'live').default('live'),
        STELLAR_NETWORK: Joi.string().valid('testnet', 'pubnet').default('testnet'),
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.user'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        // Entity metadata is discovered from the `TypeOrmModule.forFeature`
        // registration in each feature module. Keeping a hand-maintained
        // `entities: [...]` list here silently omitted most modules and made
        // every repository for a non-listed entity fail at runtime with an
        // EntityMetadataNotFoundError. `autoLoadEntities` is the single
        // source of truth; `scripts/audit-modules.ts` fails if any entity is
        // missing a `forFeature` registration.
        autoLoadEntities: true,
        migrations: [join(__dirname, '**', 'migrations', '*.{ts,js}')],
        synchronize: configService.get('database.synchronize') === true,
        migrationsRun: configService.get('database.migrationsRun') === true,
      }),
    }),
    AchievementModule,
    ActivityModule,
    AnalyticModule,
    ApiKeyModule,
    HealthModule,
    AuthModule,
    // Redis-backed caching + single-flight for the read-heavy endpoints
    // (`/streaks/leaderboard`, `/analytics/puzzles/most-solved`) (#107).
    CacheModule,
    ContentModule,
    ContentRatingModule,
    DailyRewardModule,
    FeedbackModule,
    GeoStatsModule,
    HintModule,
    InAppNotificationsModule,
    MaintenanceModeModule,
    MigrationModule,
    MilestoneModule,
    MultiplayerQueueModule,
    NFTClaimModule,
    NftMarketplaceStubModule,
    ProgressModule,
    PromoCodeModule,
    PuzzleAccessLogModule,
    PuzzleCategoryModule,
    PuzzleCommentModule,
    PuzzleDependencyModule,
    PuzzleDraftModule,
    PuzzleModule,
    PuzzleReviewModule,
    AuditLogModule,
    PuzzleSubmissionModule,
    PuzzleTranslationModule,
    RateLimiterModule,
    ReferralModule,
    ReportsModule,
    RewardShopModule,
    RewardsModule,
    StreakModule,
    TimeTrialModule,
    TokenVerificationModule,
    UserActivityLogModule,
    UserInventoryModule,
    UserModule,
    UserRankingModule,
    UserReactionModule,
    UserReportCardModule,
    OutboxModule,
  ],
  controllers: [AppController],
  providers: [AppService, GracefulShutdownService],
})
export class AppModule {}
