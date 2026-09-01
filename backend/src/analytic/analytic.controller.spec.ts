import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticController } from './analytic.controller';
import { AnalyticService } from './analytic.service';
import { PG_POOL } from './database/postgres.provider';

describe('AnalyticController', () => {
  let controller: AnalyticController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticController],
      providers: [
        AnalyticService,
        { provide: PG_POOL, useValue: undefined },
      ],
    }).compile();

    controller = module.get<AnalyticController>(AnalyticController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
