import { Module } from '@nestjs/common';
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
import { Wallet } from './wallet/entities/wallet.entity';
import { ConsumedWalletNonce } from './wallet/entities/consumed-nonce.entity';
import { TokenHistory } from './user-token-history/entities/token-history.entity';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ActivityModule } from './activity/activity.module';
import { AnalyticModule } from './analytic/analytic.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { AuthModule } from './auth/auth.module';
import { ContentModule } from './content/content.module';
import { ContentRatingModule } from './content-rating/content-rating.module';
import { HintModule } from './hint/hint.module';
import { InAppNotificationsModule } from './in-app-notifications/in-app-notifications.module';
import { MultiplayerQueueModule } from './multiplayer-queue/multiplayer-queue.module';
import { NFTClaimModule } from './nft-claim/nft-claim.module';
import { ProgressModule } from './progress/progress.module';
import { PuzzleCategoryModule } from './puzzle-category/puzzle-category.module';
import { PuzzleDependencyModule } from './puzzle-dependency/puzzle-dependency.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { PuzzleSubmissionModule } from './puzzle-submission/puzzle-submission.module';
import { PuzzleTranslationModule } from './puzzle-translation/puzzle-translation.module';
import { ReferralModule } from './referral/referral.module';
import { ReportModule } from './report/report.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { RewardModule } from './reward/reward.module';
import { StreakModule } from './streak/streak.module';
import { TimeTrialModule } from './time-trial/time-trial.module';
import { UserActivityLogModule } from './user-activity-log/user-activity-log.module';
import { UserInventoryModule } from './user-inventory/user-inventory.module';
import { UserRankingModule } from './user-ranking/user-ranking.module';
import { UserReactionModule } from './user-reaction/user-reaction.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';
import { MaintenanceModeModule } from './maintenance-mode/maintenance-mode.module';
import { WalletModule } from './wallet/wallet.module';
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
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
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
        entities: [User, TimeTrial, Puzzle, Category, Report, Wallet, ConsumedWalletNonce, TokenHistory],
        migrations: [join(__dirname, '**', 'migrations', '*.{ts,js}')],
        synchronize: configService.get('database.synchronize') === true,
        autoLoadEntities: configService.get('database.autoload') === true,
        migrationsRun: configService.get('database.migrationsRun') === true,
      }),
    }),
    ActivityModule,
    AnalyticModule,
    ApiKeyModule,
    AuthModule,
    ContentModule,
    ContentRatingModule,
    HintModule,
    InAppNotificationsModule,
    MultiplayerQueueModule,
    NFTClaimModule,
    ProgressModule,
    PuzzleCategoryModule,
    PuzzleDependencyModule,
    PuzzleModule,
    PuzzleSubmissionModule,
    PuzzleTranslationModule,
    ReferralModule,
    ReportModule,
    RewardShopModule,
    RewardModule,
    StreakModule,
    TimeTrialModule,
    UserActivityLogModule,
    UserInventoryModule,
    UserRankingModule,
    UserReactionModule,
    UserReportCardModule,
    MaintenanceModeModule,
    WalletModule,
  ],
  controllers: [AppController],
  providers: [AppService, GracefulShutdownService],
})
export class AppModule {}
