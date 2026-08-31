import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { Report } from './entities/report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report]), AuditLogModule, AdminAuthModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportsModule {}
