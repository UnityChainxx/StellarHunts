import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import appConfig from 'config/app.config';
import databaseConfig from 'config/database.config';

import { User } from './auth/entities/user.entity';
import { TimeTrial } from './time-trial/time-trial.entity';
import { Puzzle } from './puzzle/puzzle.entity';
import { Category } from './puzzle-category/entities/category.entity';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { ActivityModule } from './activity/activity.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { ContentModule } from './content/content.module';
import { ContentRatingModule } from './content-rating/content-rating.module';
import { InAppNotificationsModule } from './in-app-notifications/in-app-notifications.module';
import { MultiplayerQueueModule } from './multiplayer-queue/multiplayer-queue.module';
import { NFTClaimModule } from './nft-claim/nft-claim.module';
import { ProgressModule } from './progress/progress.module';
import { PuzzleDependencyModule } from './puzzle-dependency/puzzle-dependency.module';
import { PuzzleModule } from './puzzle/puzzle.module';
import { PuzzleSubmissionModule } from './puzzle-submission/puzzle-submission.module';
import { PuzzleTranslationModule } from './puzzle-translation/puzzle-translation.module';
import { ReportsModule } from './reports/reports.module';
import { RewardShopModule } from './reward-shop/reward-shop.module';
import { TimeTrialModule } from './time-trial/time-trial.module';
import { UserActivityLogModule } from './user-activity-log/user-activity-log.module';
import { UserRankingModule } from './user-ranking/user-ranking.module';
import { UserReactionModule } from './user-reaction/user-reaction.module';
import { UserReportCardModule } from './user-report-card/user-report-card.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [appConfig, databaseConfig],
      cache: true,
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
        entities: [User, TimeTrial, Puzzle, Category],
        synchronize: configService.get('database.synchronize'),
        autoLoadEntities: configService.get('database.autoload'),
      }),
    }),
    ActivityModule,
    AnalyticsModule,
    ApiKeyModule,
    ContentModule,
    ContentRatingModule,
    InAppNotificationsModule,
    MultiplayerQueueModule,
    NFTClaimModule,
    ProgressModule,
    PuzzleDependencyModule,
    PuzzleModule,
    PuzzleSubmissionModule,
    PuzzleTranslationModule,
    ReportsModule,
    RewardShopModule,
    TimeTrialModule,
    UserActivityLogModule,
    UserRankingModule,
    UserReactionModule,
    UserReportCardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
