import { CsrfMiddleware } from './common/security/csrf.middleware';
import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import * as Joi from 'joi';

import appConfig from 'config/app.config';
import databaseConfig from 'config/database.config';

import { User } from './auth/entities/user.entity';
import { TimeTrial } from './time-trial/time-trial.entity';
import { Puzzle } from './puzzle/puzzle.entity';
import { Category } from './puzzle-category/entities/category.entity';
import { Report } from './report/entities/report.entity';
import { AuditLog } from './audit-log/entities/audit-log.entity';
import { Admin } from './admin/admin.entity';
import { PuzzleReview } from './puzzle-review/puzzle-review/entities/puzzle-review.entity';
import { ReviewModeration } from './puzzle-review/puzzle-review/entities/review-moderation.entity';
import { DraftPuzzle } from './puzzle-draft/entities/draft-puzzle.entity';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AchievementModule } from './achievement/achievement.module';
import { ActivityModule } from './activity/activity.module';
import { AnalyticsModule } from './analytic/analytic.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { BadgeModule } from './badge/badge.module';
import { CacheModule } from './cache/cache.module';
import { ContentModule } from './content/content.module';
import { ContentRatingModule } from './content-rating/content-rating.module';
import { DailyRewardModule } from './daily-reward/daily-reward.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GeoStatsModule } from './geostat/geostat.module';
import { HintModule } from './hint/hint.module';
import { InAppNotificationsModule } from './in-app-notifications/in-app-notifications.module';
import { MaintenanceModeModule } from './maintenance-mode/maintenance-mode.module';
import { MigrationModule } from './migration/migration.module';
import { MilestoneModule } from './milestone/milestone.module';
import { MultiplayerQueueModule } from './multiplayer-queue/multiplayer-queue.module';
import { NFTClaimModule } from './nft-claim/nft-claim.module';
import { NftMarketplaceStubModule } from './nft-marketplace-stub/nft-marketplace-stub.module';
import { ProgressModule } from './progress/progress.module';
import { PromoCodeModule } from './promo-code/entities/promo-code.module';
import { PuzzleAccessLogModule } from './puzzle-access-log/puzzle-access-log.module';
import { PuzzleCategoryModule } from './puzzle-category/puzzle-category.module';
import { PuzzleCommentModule } from './puzzle-comment/puzzle-comment.module';
import { PuzzleDependencyModule } from './puzzle-dependency/puzzle-dependency.module';
import { PuzzleDraftModule } from './puzzle-draft/puzzle-draft.module';
import { PuzzleForkModule } from './puzzle-fork/puzzle-fork.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { PuzzleReviewModule } from './puzzle-review/puzzle-review/puzzle-review.module';
import { PuzzleSubmissionModule } from './puzzle-submission/puzzle-submission.module';
import { PuzzleTranslationModule } from './puzzle-translation/puzzle-translation.module';
import { PuzzleVersioningModule } from './puzzle-versioning/puzzle-versioning.module';
import { QuizModule } from './quiz/quiz.module';
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
import { AuditLogModule } from './audit-log/audit-log.module';
import { PuzzleDraftModule } from './puzzle-draft/puzzle-draft.module';
import { PuzzleReviewModule } from './puzzle-review/puzzle-review/puzzle-review.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';
import { HealthModule } from './health/health.module';
import { MaintenanceModeModule } from './maintenance-mode/maintenance-mode.module';
import { GracefulShutdownService } from './graceful-shutdown.service';

@Module({
  imports: [
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
        FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().port().default(5432),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        DATABASE_SYNC: Joi.string().valid('true', 'false').default('false'),
        DATABASE_LOAD: Joi.string().valid('true', 'false').default('false'),
        // Stellar / Soroban integration. In `live` mode the RPC URL and
        // contract IDs are mandatory; in `mock` mode they may be omitted.
        STELLAR_MODE: Joi.string().valid('mock', 'live').default('mock'),
        STELLAR_NETWORK: Joi.string()
          .valid('testnet', 'mainnet')
          .default('testnet'),
        SOROBAN_RPC_URL: Joi.string()
          .uri()
          .when('STELLAR_MODE', { is: 'live', then: Joi.required() }),
        SOROBAN_NFT_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
          is: 'live',
          then: Joi.required(),
        }),
        STELLAR_HUNTS_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
          is: 'live',
          then: Joi.required(),
        }),
        STELLAR_HUNTS_NFT_CONTRACT_ID: Joi.string().when('STELLAR_MODE', {
          is: 'live',
          then: Joi.required(),
        }),
        // Redis cache. Optional so the app can boot (with degraded caching)
        // when Redis is not configured.
        REDIS_URL: Joi.string().uri().allow(''),
        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().port().default(6379),
        REDIS_PASSWORD: Joi.string().allow(''),
        REDIS_DB: Joi.number().integer().min(0).default(0),
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
        entities: [
          User,
          TimeTrial,
          Puzzle,
          Category,
          Report,
          AuditLog,
          Admin,
          PuzzleReview,
          ReviewModeration,
          DraftPuzzle,
        ],
        synchronize: configService.get('database.synchronize'),
        autoLoadEntities: configService.get('database.autoload'),
      }),
    }),
    AchievementModule,
    ActivityModule,
    AnalyticsModule,
    ApiKeyModule,
    HealthModule,
    AuthModule,
    BadgeModule,
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
    PuzzleVersioningModule,
    QuizModule,
    RateLimiterModule.forRoot(),
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
    UserSettingsModule,
    UserTokenHistoryModule,
    WalletModule,
  ],
  controllers: [AppController],
  providers: [AppService, GracefulShutdownService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
