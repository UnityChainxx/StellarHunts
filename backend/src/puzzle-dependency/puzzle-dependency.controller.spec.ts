import { Test, TestingModule } from '@nestjs/testing';
import { PuzzleDependencyController } from './puzzle-dependency.controller';
import { PuzzleDependencyService } from './puzzle-dependency.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PuzzleDependency } from './entities/puzzle-dependency.entity';
import { PuzzleCompletion } from './entities/puzzle-completion.entity';

describe('PuzzleDependencyController', () => {
  let controller: PuzzleDependencyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PuzzleDependencyController],
      providers: [
        PuzzleDependencyService,
        { provide: getRepositoryToken(PuzzleDependency), useValue: {} },
        { provide: getRepositoryToken(PuzzleCompletion), useValue: {} },
      ],
    }).compile();

    controller = module.get<PuzzleDependencyController>(
      PuzzleDependencyController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
