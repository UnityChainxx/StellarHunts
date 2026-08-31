import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogService, DEFAULT_RETENTION_DAYS } from './audit-log.service';
import { FilterAuditLogDto } from './Dto/filter-audit-log.dto';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { AdminRole } from '../admin/admin-role.enum';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary: 'List audit logs (admin only)',
    description:
      'Audit logs are restricted to administrators; ordinary users cannot read or modify them.',
  })
  async getAuditLogs(@Query() filter: FilterAuditLogDto) {
    return this.auditLogService.findAll({
      ...filter,
      startDate: filter.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter.endDate ? new Date(filter.endDate) : undefined,
    });
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as CSV (admin only)' })
  async exportAuditLogs(
    @Query() filter: FilterAuditLogDto,
    @Res() res: Response,
  ) {
    const logs = await this.auditLogService.findAll({
      ...filter,
      startDate: filter.startDate ? new Date(filter.startDate) : undefined,
      endDate: filter.endDate ? new Date(filter.endDate) : undefined,
    });

    const escapeCsv = (value: unknown): string => {
      const str = value == null ? '' : String(value);
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const header = ['id', 'userId', 'action', 'timestamp', 'meta'];
    const rows = logs.map((log) =>
      [
        escapeCsv(log.id),
        escapeCsv(log.userId),
        escapeCsv(log.action),
        escapeCsv(log.timestamp?.toISOString()),
        escapeCsv(JSON.stringify(log.meta ?? {})),
      ].join(','),
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-logs.csv"',
    );
    res.send([header.join(','), ...rows].join('\n'));
  }

  @Delete('older-than/:days')
  @ApiOperation({
    summary: 'Purge audit logs older than N days (admin only)',
    description: `Enforces the retention policy (default ${DEFAULT_RETENTION_DAYS} days).`,
  })
  @ApiParam({ name: 'days', description: 'Retention window in days' })
  @ApiResponse({
    status: 200,
    description: 'Returns the number of purged audit log records',
  })
  async purgeOlderThan(
    @Param('days', ParseIntPipe) days: number,
  ): Promise<{ purged: number; retentionDays: number }> {
    const purged = await this.auditLogService.purgeOlderThan(days);
    return { purged, retentionDays: days };
  }
}
