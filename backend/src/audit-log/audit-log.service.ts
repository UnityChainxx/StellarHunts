import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Default retention window (in days). Logs older than this are considered
 * expired and are purged by `purgeOlderThan` / scheduled retention cleanup.
 * Audit logs have a 90-day retention policy to balance compliance obligations
 * with storage bounding.
 */
export const DEFAULT_RETENTION_DAYS = 90;

export interface PaginatedAuditLogs {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AuditLogFilters {
  userId?: string;
  actor?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Append-only: the audit log is only ever written by the platform (via
   * `createLog`). There are no public update/delete mutations — retention
   * cleanup happens exclusively through the admin-only `purgeOlderThan` or
   * bounded background retention jobs.
   */
  async createLog(userId: string, action: string, meta?: Record<string, any>) {
    const log = this.auditRepo.create({ userId, action, meta });
    return this.auditRepo.save(log);
  }

  /**
   * Query audit logs with bounded pagination, deterministic ordering,
   * and comprehensive filtering (actor, target type, target id, action, date range).
   */
  async findAll(filters: AuditLogFilters): Promise<PaginatedAuditLogs> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const actor = filters.actor || filters.userId;

    const qb = this.auditRepo.createQueryBuilder('log');

    if (actor) {
      qb.andWhere('log.userId = :actor', { actor });
    }
    if (filters.action) {
      qb.andWhere('log.action ILIKE :action', { action: `%${filters.action}%` });
    }
    if (filters.startDate && filters.endDate) {
      qb.andWhere('log.timestamp BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    } else if (filters.startDate) {
      qb.andWhere('log.timestamp >= :startDate', { startDate: filters.startDate });
    } else if (filters.endDate) {
      qb.andWhere('log.timestamp <= :endDate', { endDate: filters.endDate });
    }
    if (filters.targetType) {
      qb.andWhere("(log.meta->>'targetType' = :targetType)", {
        targetType: filters.targetType,
      });
    }
    if (filters.targetId) {
      qb.andWhere(
        "(log.meta->>'targetId' = :targetId OR log.meta->>'reviewId' = :targetId)",
        { targetId: filters.targetId },
      );
    }

    // Deterministic ordering: descending timestamp, tie-broken by id
    qb.orderBy('log.timestamp', 'DESC')
      .addOrderBy('log.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Resolve audit entries for a specific target entity (e.g. moderation decision history)
   */
  async findByTarget(targetType: string, targetId: string): Promise<AuditLog[]> {
    const result = await this.findAll({ targetType, targetId, limit: 100 });
    return result.data;
  }

  /**
   * Retention enforcement: deletes expired records in bounded batches
   * so cleanup runs do not hold exclusive table locks or exceed transaction budgets.
   * Safe for multi-replica concurrency.
   */
  async cleanupExpiredLogs(
    days: number = DEFAULT_RETENTION_DAYS,
    batchSize: number = 500,
    maxBatches: number = 20,
  ): Promise<{ deletedRows: number; durationMs: number; batches: number }> {
    const startTime = Date.now();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    let totalDeleted = 0;
    let batchCount = 0;

    while (batchCount < maxBatches) {
      const expiredLogs = await this.auditRepo
        .createQueryBuilder('log')
        .select('log.id', 'id')
        .where('log.timestamp < :cutoff', { cutoff })
        .limit(batchSize)
        .getRawMany();

      if (!expiredLogs || expiredLogs.length === 0) {
        break;
      }

      const ids = expiredLogs.map((l) => l.id || l.log_id);
      const deleteResult = await this.auditRepo
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
      `AuditLog retention cleanup: purged ${totalDeleted} records older than ${days} days in ${durationMs}ms (${batchCount} batches)`,
    );

    return { deletedRows: totalDeleted, durationMs, batches: batchCount };
  }

  /**
   * Admin-facing purge endpoint adapter
   */
  async purgeOlderThan(days: number): Promise<number> {
    const { deletedRows } = await this.cleanupExpiredLogs(days);
    return deletedRows;
  }

  /**
   * Scheduled daily midnight retention job
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scheduledRetentionCleanup(): Promise<void> {
    await this.cleanupExpiredLogs(DEFAULT_RETENTION_DAYS);
  }
}
