import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionAnalyticsPreference } from './entities/session-analytics-preference.entity';
import { SessionPageVisit } from './entities/session-page-visit.entity';
import { SessionPuzzleAttempt } from './entities/session-puzzle-attempt.entity';
import { UserSession } from './entities/user-session.entity';
import { SessionAnalyticsController } from './session-analytics.controller';
import { SessionAnalyticsService } from './session-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSession,
      SessionPageVisit,
      SessionPuzzleAttempt,
      SessionAnalyticsPreference,
    ]),
  ],
  controllers: [SessionAnalyticsController],
  providers: [SessionAnalyticsService],
  exports: [SessionAnalyticsService],
})
export class SessionAnalyticsModule {}
