import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Report, ReportStatus } from './entities/report.entity';

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}

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

  async update(id: number, updateReportDto: UpdateReportDto): Promise<Report> {
    const report = await this.findOne(id);
    Object.assign(report, updateReportDto);
    return this.reportRepository.save(report);
  }

  async remove(id: number): Promise<void> {
    const report = await this.findOne(id);
    await this.reportRepository.remove(report);
  }

  async triage(id: number, adminNote?: string): Promise<Report> {
    const report = await this.findOne(id);
    report.status = ReportStatus.TRIAGED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    return this.reportRepository.save(report);
  }

  async assign(id: number, assignedTo: string): Promise<Report> {
    const report = await this.findOne(id);
    report.status = ReportStatus.IN_PROGRESS;
    report.assignedTo = assignedTo;
    return this.reportRepository.save(report);
  }

  async resolve(id: number, adminNote?: string): Promise<Report> {
    const report = await this.findOne(id);
    report.status = ReportStatus.RESOLVED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    return this.reportRepository.save(report);
  }

  async reject(id: number, adminNote?: string): Promise<Report> {
    const report = await this.findOne(id);
    report.status = ReportStatus.REJECTED;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    return this.reportRepository.save(report);
  }

  async escalate(id: number, adminNote?: string): Promise<Report> {
    const report = await this.findOne(id);
    report.status = ReportStatus.IN_PROGRESS;
    if (adminNote) {
      report.adminNote = adminNote;
    }
    return this.reportRepository.save(report);
  }
}
