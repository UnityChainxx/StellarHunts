import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PuzzleHintExtendedService } from './puzzle-hint-extended.service';
import { PuzzleHintUsage } from './entities/puzzle-hint-usage.entity';
import { NotFoundException } from '@nestjs/common';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

describe('PuzzleHintExtendedService', () => {
  let service: PuzzleHintExtendedService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleHintExtendedService,
        { provide: getRepositoryToken(PuzzleHintUsage), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<PuzzleHintExtendedService>(PuzzleHintExtendedService);
    repo = module.get(getRepositoryToken(PuzzleHintUsage));
  });

  it('should create a hint via upsert', async () => {
    const hint = await service.upsertHint({ puzzleId: 'p1', content: 'Think XLM', order: 0, tokenCost: 5 });
    expect(hint.content).toBe('Think XLM');
  });

  it('should return existing hint on second upsert', async () => {
    await service.upsertHint({ puzzleId: 'p1', content: 'Hint A', order: 0, tokenCost: 5 });
    const updated = await service.upsertHint({ puzzleId: 'p1', content: 'Hint B', order: 0, tokenCost: 5 });
    expect(updated.content).toBe('Hint B');
  });

  it('should request a hint and record usage', async () => {
    await service.upsertHint({ puzzleId: 'p1', content: 'Think Stellar', order: 0, tokenCost: 5 });
    repo.findOne.mockResolvedValue(null);
    const usage = { id: 1, puzzleId: 'p1', userId: 'u1', hintOrder: 0, tokenCost: 5 };
    repo.create.mockReturnValue(usage);
    repo.save.mockResolvedValue(usage);

    const result = await service.requestHint('u1', { puzzleId: 'p1', hintOrder: 0 });
    expect(result.content).toBe('Think Stellar');
    expect(repo.save).toHaveBeenCalled();
  });

  it('should not re-charge for already used hint', async () => {
    await service.upsertHint({ puzzleId: 'p1', content: 'Already shown', order: 0, tokenCost: 5 });
    const existing = { id: 1, puzzleId: 'p1', userId: 'u1', hintOrder: 0 };
    repo.findOne.mockResolvedValue(existing);

    const result = await service.requestHint('u1', { puzzleId: 'p1', hintOrder: 0 });
    expect(result.content).toBe('Already shown');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException for unknown puzzle', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.requestHint('u1', { puzzleId: 'unknown', hintOrder: 0 })).rejects.toThrow(NotFoundException);
  });

  it('should list hint summaries without content', async () => {
    await service.upsertHint({ puzzleId: 'p2', content: 'Secret', order: 0, tokenCost: 10 });
    const summaries = service.listHintSummaries('p2');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).not.toHaveProperty('content');
  });
});
