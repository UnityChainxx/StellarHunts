import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../../../../backend/src/admin/admin-auth.module';
import { ModerationCheckLog } from './entities/moderation-check-log.entity';
import { ModerationDecision } from './entities/moderation-decision.entity';
import { ModerationQueueItem } from './entities/moderation-queue-item.entity';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModerationQueueItem,
      ModerationCheckLog,
      ModerationDecision,
    ]),
    AdminAuthModule,
  ],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
