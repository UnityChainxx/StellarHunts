import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as Joi from 'joi';

import appConfig from 'config/app.config';
import databaseConfig from 'config/database.config';

import { User } from './auth/entities/user.entity';
import { TimeTrial } from './time-trial/time-trial.entity';
import { Puzzle } from './puzzle/puzzle.entity';
import { Category } from './puzzle-category/entities/category.entity';
import { Report } from './report/entities/report.entity';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ActivityModule } from './activity/activity.module';
import { AnalyticsModule } from './analytic/analytic.module';
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
import { ReportsModule } from './report/report.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { RewardsModule } from './reward/reward.module';
import { StreakModule } from './streak/streak.module';
import { TimeTrialModule } from './time-trial/time-trial.module';
import { UserActivityLogModule } from './user-activity-log/user-activity-log.module';
import { UserInventoryModule } from './user-inventory/user-inventory.module';
import { UserRankingModule } from './user-ranking/user-ranking.module';
import { UserReactionModule } from './user-reaction/user-reaction.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';
import { MaintenanceModeModule } from './maintenance-mode/maintenance-mode.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig],
      cache: true,
      validationSchema: Joi.object({
        JWT_SECRET: Joi.string().required(),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().default(5432),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        STELLAR_MODE: Joi.string().valid('mock', 'live').default('live'),
        NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
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
        entities: [User, TimeTrial, Puzzle, Category, Report],
        synchronize: configService.get('database.synchronize'),
        autoLoadEntities: configService.get('database.autoload'),
      }),
    }),
    ActivityModule,
    AnalyticsModule,
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
    ReportsModule,
    RewardShopModule,
    RewardsModule,
    StreakModule,
    TimeTrialModule,
    UserActivityLogModule,
    UserInventoryModule,
    UserRankingModule,
    UserReactionModule,
    UserReportCardModule,
    MaintenanceModeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
