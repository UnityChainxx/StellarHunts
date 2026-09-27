import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportCard } from './entities/user-report-card.entity';
import { UserReportCardController } from './user-report-card.controller';
import { UserReportCardService } from './user-report-card.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReportCard])],
  controllers: [UserReportCardController],
  providers: [UserReportCardService],
  exports: [UserReportCardService],
})
export class UserReportCardModule {}
