import { Test, TestingModule } from '@nestjs/testing';
import { UserActivityLogService } from './user-activity-log.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityLog } from './entities/activity-log.entity';

describe('UserActivityLogService', () => {
  let service: UserActivityLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserActivityLogService,
        { provide: getRepositoryToken(ActivityLog), useValue: {} },
      ],
    }).compile();

    service = module.get<UserActivityLogService>(UserActivityLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
