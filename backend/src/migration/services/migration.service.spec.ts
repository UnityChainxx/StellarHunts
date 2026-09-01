import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MigrationService } from './migration.service';
import { Puzzle } from '../entities/puzzle.entity';
import { PuzzleData } from '../interfaces/puzzle.interface';

function makePuzzle(title: string, category = 'math'): PuzzleData {
  return {
    title,
    category,
    difficulty: 'easy',
    content: {
      question: 'Question for ' + title,
      answer: '42',
      type: 'text',
    },
  };
}

describe('MigrationService (atomic / resumable import)', () => {
  let service: MigrationService;
  let dataSource: {
    transaction: jest.Mock;
  };
  let puzzleRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  // Shared manager object handed to the transaction callback. It returns
  // the same fake puzzle repository regardless of which repository is
  // requested, so state can be inspected after a run.
  const buildManager = () => ({
    getRepository: jest.fn(() => puzzleRepository),
  });

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(),
    };
    puzzleRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 'new-id', ...data })),
      save: jest.fn(async (data) => data),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MigrationService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(Puzzle),
          useValue: puzzleRepository,
        },
      ],
    }).compile();

    service = module.get<MigrationService>(MigrationService);
  });

  const uploadInfo = { filename: 'f.json', fileSize: 10, uploadedBy: 'admin' };

  it('imports every row on a clean batch', async () => {
    puzzleRepository.findOne.mockResolvedValue(undefined);

    // Run the provided transaction callback against the fake manager.
    dataSource.transaction.mockImplementation(async (cb) => cb(buildManager()));

    const result = await service.migratePuzzles(
      [makePuzzle('A'), makePuzzle('B')],
      uploadInfo,
    );

    expect(result.success).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(result.summary.successfulInserts).toBe(2);
    expect(result.summary.failedInserts).toBe(0);
    expect(result.summary.duplicatesSkipped).toBe(0);
    expect(puzzleRepository.save).toHaveBeenCalledTimes(2);
  });

  it('aborts and rolls back the whole batch when a row fails mid-import', async () => {
    puzzleRepository.findOne.mockResolvedValue(undefined);

    // Simulate the transaction throwing when the callback is run.
    let manager: ReturnType<typeof buildManager>;
    dataSource.transaction.mockImplementation(async (cb) => {
      manager = buildManager();
      puzzleRepository.save.mockReset();
      puzzleRepository.save
        .mockResolvedValueOnce({ id: 'a' })
        .mockImplementationOnce(async () => {
          throw new Error('unique constraint violated on in-batch duplicate');
        });
      try {
        return await cb(manager);
      } catch (err) {
        // The real DataSource rolls back and rethrows here.
        throw err;
      }
    });

    const result = await service.migratePuzzles(
      [makePuzzle('A'), makePuzzle('A')], // in-batch duplicate -> unique index error
      uploadInfo,
    );

    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    // Because the transaction rolled back, nothing counted as persisted.
    expect(result.summary.successfulInserts).toBe(0);
    expect(result.summary.failedInserts).toBe(1);
    expect(result.errors[0].error).toContain('rolled back');
    expect(result.errors[0].index).toBe(1);
  });

  it('skips pre-existing rows so re-running the import is resumable', async () => {
    // Row 'A' already exists in the DB; 'B' does not.
    puzzleRepository.findOne.mockImplementation(async ({ where }) => {
      return where.title === 'A' ? { id: 'existing' } : undefined;
    });

    dataSource.transaction.mockImplementation(async (cb) => cb(buildManager()));

    const result = await service.migratePuzzles(
      [makePuzzle('A'), makePuzzle('B')],
      uploadInfo,
    );

    expect(result.success).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(result.summary.duplicatesSkipped).toBe(1);
    expect(result.summary.successfulInserts).toBe(1);
    // Only the non-duplicate row is saved.
    expect(puzzleRepository.save).toHaveBeenCalledTimes(1);
  });
});
