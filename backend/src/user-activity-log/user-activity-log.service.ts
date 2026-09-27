import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ActivityLog } from './entities/activity-log.entity';

export const USER_ACTIVITY_RETENTION_DAYS = 30;

@Injectable()
export class UserActivityLogService {
  private readonly logger = new Logger(UserActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logRepo: Repository<ActivityLog>,
  ) {}

  async logActivity(userId: string, actionType: string, metadata?: any) {
    const log = this.logRepo.create({ userId, actionType, metadata });
    return this.logRepo.save(log);
  }

  async filterLogs({
    userId,
    actionType,
    startDate,
    endDate,
  }: {
    userId?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const query = this.logRepo.createQueryBuilder('log');

    if (userId) query.andWhere('log.userId = :userId', { userId });
    if (actionType)
      query.andWhere('log.actionType = :actionType', { actionType });
    if (startDate) query.andWhere('log.timestamp >= :startDate', { startDate });
    if (endDate) query.andWhere('log.timestamp <= :endDate', { endDate });

    return query.orderBy('log.timestamp', 'DESC').limit(100).getMany();
  }

  /**
   * Bounded batch deletion for activity logs older than retentionDays.
   * Safe for multi-replica concurrency and bounds table locking.
   */
  async cleanupExpiredLogs(
    days: number = USER_ACTIVITY_RETENTION_DAYS,
    batchSize: number = 500,
    maxBatches: number = 20,
  ): Promise<{ deletedRows: number; durationMs: number; batches: number }> {
    const startTime = Date.now();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const expiredLogs = await this.logRepo
        .createQueryBuilder('log')
        .select('log.id', 'id')
        .where('log.timestamp < :cutoff', { cutoff })
        .limit(batchSize)
        .getRawMany();

      if (!expiredLogs || expiredLogs.length === 0) {
        break;
      }

      const ids = expiredLogs.map((l) => l.id || l.log_id);
      const deleteResult = await this.logRepo
        .createQueryBuilder()
        .delete()
        .where('id IN (:...ids)', { ids })
        .execute();

      const affected = deleteResult.affected ?? 0;
      totalDeleted += affected;
      batchCount++;

      if (affected < batchSize) {
        break;
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `ActivityLog retention cleanup: purged ${totalDeleted} records older than ${days} days in ${durationMs}ms (${batchCount} batches)`,
    );

    return { deletedRows: totalDeleted, durationMs, batches: batchCount };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledRetentionCleanup(): Promise<void> {
    await this.cleanupExpiredLogs();
  }
}
