import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ReportService } from './report.service';
import { Report, ReportStatus } from './entities/report.entity';
import { CreateReportDto } from './dto/create-report.dto';

describe('ReportService', () => {
  let service: ReportService;
  let repository: jest.Mocked<
    Pick<Repository<Report>, 'create' | 'save' | 'findOne' | 'find'>
  >;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<Repository<Report>, 'create' | 'save' | 'findOne' | 'find'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: getRepositoryToken(Report),
          useValue: repository,
        },
        {
          provide: AuditLogService,
          useValue: { createLog: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
  });

  it('creates a report with an OPEN status by default', async () => {
    const dto: CreateReportDto = {
      puzzleId: 7,
      message: 'Inappropriate content',
    };
    const expected = {
      id: 1,
      puzzleId: 7,
      userId: 42,
      message: 'Inappropriate content',
      status: ReportStatus.OPEN,
    } as Report;

    (repository.create as jest.Mock).mockReturnValue(expected);
    (repository.save as jest.Mock).mockResolvedValue(expected);

    await expect(service.create(dto, 42)).resolves.toEqual(expected);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        puzzleId: 7,
        userId: 42,
        status: ReportStatus.OPEN,
        message: 'Inappropriate content',
      }),
    );
  });

  it('resolves a report when requested by an admin', async () => {
    const existing = { id: 2, status: ReportStatus.OPEN } as Report;
    const resolved = { ...existing, status: ReportStatus.RESOLVED } as Report;

    (repository.findOne as jest.Mock).mockResolvedValue(existing);
    (repository.save as jest.Mock).mockResolvedValue(resolved);

    await expect(
      service.resolve(2, 'Resolved after review'),
    ).resolves.toMatchObject({
      status: ReportStatus.RESOLVED,
    });
  });
});
