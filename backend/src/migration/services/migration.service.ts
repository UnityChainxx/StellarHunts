import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Puzzle } from '../entities/puzzle.entity';
import type {
  PuzzleData,
  MigrationResult,
  MigrationError,
} from '../interfaces/puzzle.interface';

/**
 * Thrown inside the migration transaction to abort the whole batch. Any
 * error that escapes the transaction callback rolls back every row so a
 * partial import can never leave categories/puzzles/dependencies/rewards
 * in an inconsistent state.
 */
export class MigrationAbortError extends Error {
  constructor(
    readonly index: number,
    readonly puzzle: Partial<PuzzleData>,
    message: string,
  ) {
    super(message);
    this.name = 'MigrationAbortError';
  }
}

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Puzzle)
    private readonly puzzleRepository: Repository<Puzzle>,
  ) {}

  /**
   * Migrate puzzle data to database.
   *
   * The whole batch runs inside a single DB transaction (atomic import):
   * if any row fails to persist, the transaction rolls back and nothing is
   * written. Rows whose `(title, category)` pair already exists in the DB
   * are skipped so re-running the same upload is safe and resumable, but a
   * genuine failure (e.g. a duplicate pair within the same incoming batch,
   * which violates the unique index) aborts the entire import rather than
   * leaving a partial write behind.
   */
  async migratePuzzles(
    puzzleData: PuzzleData[],
    uploadInfo: { filename: string; fileSize: number; uploadedBy: string },
  ): Promise<MigrationResult> {
    this.logger.log(`Starting migration of ${puzzleData.length} puzzles`);

    const errors: MigrationError[] = [];
    let successfulInserts = 0;
    let duplicatesSkipped = 0;
    let rolledBack = false;

    try {
      await this.dataSource.transaction(async (manager: EntityManager) => {
        const puzzleRepo = manager.getRepository(Puzzle);

        for (let i = 0; i < puzzleData.length; i++) {
          const puzzle = puzzleData[i];

          try {
            // Check for duplicates against rows already in the DB. Pre-existing
            // duplicates are skipped (idempotent/resumable), not failures.
            const existingPuzzle = await puzzleRepo.findOne({
              where: {
                title: puzzle.title,
                category: puzzle.category,
              },
            });

            if (existingPuzzle) {
              this.logger.warn(
                `Duplicate puzzle found: ${puzzle.title} in category ${puzzle.category}`,
              );
              duplicatesSkipped++;
              continue;
            }

            // Create new puzzle entity
            const newPuzzle = puzzleRepo.create({
              title: puzzle.title,
              description: puzzle.description,
              difficulty: puzzle.difficulty,
              category: puzzle.category,
              content: puzzle.content,
              metadata: puzzle.metadata,
              tags: puzzle.tags,
              isActive: puzzle.isActive,
            });

            await puzzleRepo.save(newPuzzle);
            successfulInserts++;

            this.logger.debug(`Successfully inserted puzzle: ${puzzle.title}`);
          } catch (error) {
            // Wrap with row context, then rethrow so the surrounding
            // transaction rolls back every already-inserted row.
            throw new MigrationAbortError(
              i,
              puzzle,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      });
    } catch (error) {
      // Any error here aborts the transaction, rolling back every row that
      // the batch may have inserted before failing. Record the abort so the
      // caller can see the import did not partially apply.
      const abortError =
        error instanceof MigrationAbortError
          ? error
          : new MigrationAbortError(
              -1,
              {},
              error instanceof Error ? error.message : String(error),
            );

      rolledBack = true;
      // The transaction rolled back, so nothing was actually persisted:
      // report zero successful inserts and every row as not applied.
      successfulInserts = 0;
      errors.push({
        index: abortError.index,
        puzzle: abortError.puzzle,
        error: `Import aborted and rolled back: ${abortError.message}`,
      });

      this.logger.error(
        `Migration aborted and rolled back (row ${abortError.index}): ${abortError.message}`,
      );
    }

    const result: MigrationResult = {
      success: !rolledBack && errors.length === 0,
      summary: {
        totalProcessed: puzzleData.length,
        successfulInserts,
        failedInserts: errors.length,
        duplicatesSkipped,
      },
      errors,
      rolledBack,
      uploadInfo: {
        ...uploadInfo,
        uploadedAt: new Date(),
      },
    };

    this.logger.log(
      `Migration completed: ${successfulInserts} inserted, ${duplicatesSkipped} duplicates skipped, ${errors.length} failed${rolledBack ? ' (rolled back)' : ''}`,
    );

    return result;
  }

  /**
   * Get migration statistics
   */
  async getMigrationStats(): Promise<{
    totalPuzzles: number;
    puzzlesByDifficulty: Record<string, number>;
    puzzlesByCategory: Record<string, number>;
    recentUploads: number;
  }> {
    const totalPuzzles = await this.puzzleRepository.count();

    const difficultyStats = await this.puzzleRepository
      .createQueryBuilder('puzzle')
      .select('puzzle.difficulty', 'difficulty')
      .addSelect('COUNT(*)', 'count')
      .groupBy('puzzle.difficulty')
      .getRawMany();

    const categoryStats = await this.puzzleRepository
      .createQueryBuilder('puzzle')
      .select('puzzle.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('puzzle.category')
      .getRawMany();

    const recentUploads = await this.puzzleRepository.count({
      where: {
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    });

    return {
      totalPuzzles,
      puzzlesByDifficulty: difficultyStats.reduce((acc, item) => {
        acc[item.difficulty] = Number.parseInt(item.count);
        return acc;
      }, {}),
      puzzlesByCategory: categoryStats.reduce((acc, item) => {
        acc[item.category] = Number.parseInt(item.count);
        return acc;
      }, {}),
      recentUploads,
    };
  }

  /**
   * Cleanup old puzzle data (if needed)
   */
  async cleanupOldPuzzles(daysOld = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await this.puzzleRepository
      .createQueryBuilder()
      .delete()
      .where('createdAt < :cutoffDate', { cutoffDate })
      .andWhere('isActive = :isActive', { isActive: false })
      .execute();

    this.logger.log(`Cleaned up ${result.affected} old inactive puzzles`);
    return result.affected || 0;
  }
}
