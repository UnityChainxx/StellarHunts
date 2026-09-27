import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PuzzleAccessLog } from './entities/puzzle-access-log.entity';
import { LogAccessDto } from './dto/log-access.dto';

export const PUZZLE_ACCESS_RETENTION_DAYS = 14;

@Injectable()
export class PuzzleAccessLogService {
  private readonly logger = new Logger(PuzzleAccessLogService.name);

  constructor(
    @InjectRepository(PuzzleAccessLog)
    private readonly accessLogRepository: Repository<PuzzleAccessLog>,
  ) {}

  async logAccess(dto: LogAccessDto): Promise<PuzzleAccessLog> {
    const newLog = this.accessLogRepository.create(dto);
    return this.accessLogRepository.save(newLog);
  }

  async getMostAccessedPuzzles(): Promise<
    { puzzleId: string; accessCount: string }[]
  > {
    return this.accessLogRepository
      .createQueryBuilder('log')
      .select('log.puzzleId', 'puzzleId')
      .addSelect('COUNT(log.id)', 'accessCount')
      .groupBy('log.puzzleId')
      .orderBy('accessCount', 'DESC')
      .limit(10)
      .getRawMany();
  }

  async getUniqueUsersPerPuzzle(
    puzzleId: string,
  ): Promise<{ uniqueUserCount: number }> {
    const count = await this.accessLogRepository
      .createQueryBuilder('log')
      .select('COUNT(DISTINCT log.userId)', 'count')
      .where('log.puzzleId = :puzzleId', { puzzleId })
      .getRawOne();

    return { uniqueUserCount: parseInt(count.count, 10) || 0 };
  }

  async getTimeBasedTrends(
    days: number = 7,
  ): Promise<{ date: string; accessCount: string }[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.accessLogRepository
      .createQueryBuilder('log')
      .select('DATE(log.accessTimestamp)', 'date')
      .addSelect('COUNT(log.id)', 'accessCount')
      .where('log.accessTimestamp >= :startDate', { startDate })
      .groupBy('DATE(log.accessTimestamp)')
      .orderBy('date', 'ASC')
      .getRawMany();
  }

  /**
   * Bounded batch deletion for access logs older than retentionDays.
   * Safe for multi-replica concurrency and bounds table locking.
   */
  async cleanupExpiredLogs(
    days: number = PUZZLE_ACCESS_RETENTION_DAYS,
    batchSize: number = 500,
    maxBatches: number = 20,
  ): Promise<{ deletedRows: number; durationMs: number; batches: number }> {
    const startTime = Date.now();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const expiredLogs = await this.accessLogRepository
        .createQueryBuilder('log')
        .select('log.id', 'id')
        .where('log.accessTimestamp < :cutoff', { cutoff })
        .limit(batchSize)
        .getRawMany();

      if (!expiredLogs || expiredLogs.length === 0) {
        break;
      }

      const ids = expiredLogs.map((l) => l.id || l.log_id);
      const deleteResult = await this.accessLogRepository
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
      `PuzzleAccessLog retention cleanup: purged ${totalDeleted} records older than ${days} days in ${durationMs}ms (${batchCount} batches)`,
    );

    return { deletedRows: totalDeleted, durationMs, batches: batchCount };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledRetentionCleanup(): Promise<void> {
    await this.cleanupExpiredLogs();
  }
}
