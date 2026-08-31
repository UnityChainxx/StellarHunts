import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Report, ReportStatus } from './entities/report.entity';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Write an immutable audit record for a report management action. The
   * audit log is insert-only (no update/delete endpoints exist for it), so
   * every action keeps a permanent, tamper-evident trace.
   */
  private async audit(
    actorId: string,
    action: string,
    report: Report,
    extra: Record<string, any> = {},
  ): Promise<void> {
    await this.auditLogService.createLog(actorId, `report.${action}`, {
      reportId: report.id,
      previousStatus: extra.previousStatus,
      newStatus: report.status,
      ...extra,
    });
  }

  async create(
    createReportDto: CreateReportDto,
    userId: number,
  ): Promise<Report> {
    const existingReport = await this.reportRepository.findOne({
      where: {
        userId,
        puzzleId: createReportDto.puzzleId,
      },
    });

    if (existingReport) {
      throw new BadRequestException(
        'You have already reported this puzzle. Thank you!',
      );
    }

    const report = this.reportRepository.create({
      ...createReportDto,
      userId,
      status: ReportStatus.OPEN,
    });

    return this.reportRepository.save(report);
  }

  async findAll(): Promise<Report[]> {
    return this.reportRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Report> {
    const report = await this.reportRepository.findOne({ where: { id } });

    if (!report) {
      throw new NotFoundException(`Report with id ${id} not found`);
    }

    return report;
  }

  async update(
    id: number,
    updateReportDto: UpdateReportDto,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    Object.assign(report, updateReportDto);
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'update', saved);
    return saved;
  }

  async remove(id: number, actorId = 'system'): Promise<void> {
    const report = await this.findOne(id);
    await this.reportRepository.remove(report);
    await this.audit(actorId, 'remove', report);
  }

  async triage(
    id: number,
    adminNote?: string,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    const previousStatus = report.status;
    report.status = ReportStatus.TRIAGED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'triage', saved, { previousStatus });
    return saved;
  }

  async assign(
    id: number,
    assignedTo: string,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    const previousStatus = report.status;
    report.status = ReportStatus.IN_PROGRESS;
    report.assignedTo = assignedTo;
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'assign', saved, { previousStatus, assignedTo });
    return saved;
  }

  async resolve(
    id: number,
    adminNote?: string,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    const previousStatus = report.status;
    report.status = ReportStatus.RESOLVED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'resolve', saved, { previousStatus });
    return saved;
  }

  async reject(
    id: number,
    adminNote?: string,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    const previousStatus = report.status;
    report.status = ReportStatus.REJECTED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'reject', saved, { previousStatus });
    return saved;
  }

  async escalate(
    id: number,
    adminNote?: string,
    actorId = 'system',
  ): Promise<Report> {
    const report = await this.findOne(id);
    const previousStatus = report.status;
    report.status = ReportStatus.IN_PROGRESS;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    const saved = await this.reportRepository.save(report);
    await this.audit(actorId, 'escalate', saved, { previousStatus });
    return saved;
  }
}
