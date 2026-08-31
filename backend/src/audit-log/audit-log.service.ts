import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

/**
 * Default retention window (in days). Logs older than this are considered
 * expired and are purged by `purgeOlderThan` / the admin retention endpoint.
 */
export const DEFAULT_RETENTION_DAYS = 90;

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Append-only: the audit log is only ever written by the platform (via
   * `createLog`). There are no public update/delete mutations — retention
   * cleanup happens exclusively through the admin-only `purgeOlderThan`.
   */
  async createLog(userId: string, action: string, meta?: Record<string, any>) {
    const log = this.auditRepo.create({ userId, action, meta });
    return this.auditRepo.save(log);
  }

  async findAll(filters: {
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = Like(`%${filters.action}%`);
    if (filters.startDate && filters.endDate)
      where.timestamp = Between(filters.startDate, filters.endDate);

    return this.auditRepo.find({ where, order: { timestamp: 'DESC' } });
  }

  /**
   * Retention enforcement: deletes every record older than `days` days and
   * returns the number of purged rows. Intended to be invoked by admins
   * (or a scheduled job) so the log never grows unbounded.
   */
  async purgeOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await this.auditRepo
      .createQueryBuilder()
      .delete()
      .where('timestamp < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}
