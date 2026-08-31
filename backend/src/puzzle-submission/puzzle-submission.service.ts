import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleSubmission } from './puzzle-submission.entity';
import { Puzzle } from '../puzzle/puzzle.entity';
import { isUniqueViolation } from '../common/security/unique-violation';

@Injectable()
export class PuzzleSubmissionService {
  constructor(
    @InjectRepository(PuzzleSubmission)
    private readonly submissionRepo: Repository<PuzzleSubmission>,
    @InjectRepository(Puzzle)
    private readonly puzzleRepo: Repository<Puzzle>,
  ) {}

  async submitAnswer(
    playerId: string,
    puzzleId: string,
    answer: string,
  ) {
    // The correct answer must come from the server-side puzzle record — it is
    // never accepted from the client, otherwise a caller could grade their own
    // answer (issue #364 — unauthorized score mutations).
    const puzzle = await this.puzzleRepo.findOne({ where: { id: puzzleId } });
    if (!puzzle) {
      throw new NotFoundException(`Puzzle with ID ${puzzleId} not found`);
    }
    const correctAnswer = puzzle.solution;

    // Find last submission for this player and puzzle
    const submission = await this.submissionRepo.findOne({
      where: { playerId, puzzleId },
      order: { attemptCount: 'DESC' },
    });
    const attemptCount = submission ? submission.attemptCount + 1 : 1;
    const isCorrect =
      answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    const newSubmission = this.submissionRepo.create({
      playerId,
      puzzleId,
      answer,
      isCorrect,
      attemptCount,
    });

    try {
      await this.submissionRepo.save(newSubmission);
    } catch (error) {
      if (isUniqueViolation(error)) {
        // A concurrent request already recorded this attempt number. Return
        // the current state without writing a duplicate row (issue #364).
        const latest = await this.submissionRepo.findOne({
          where: { playerId, puzzleId },
          order: { attemptCount: 'DESC' },
        });
        return {
          isCorrect,
          attempts: latest ? latest.attemptCount : attemptCount,
          feedback: 'Duplicate submission ignored.',
        };
      }
      throw error;
    }

    return {
      isCorrect,
      attempts: attemptCount,
      feedback: isCorrect ? 'Correct answer!' : 'Incorrect answer. Try again.',
    };
  }

  async getAttempts(playerId: string, puzzleId: string): Promise<number> {
    const last = await this.submissionRepo.findOne({
      where: { playerId, puzzleId },
      order: { attemptCount: 'DESC' },
    });
    return last ? last.attemptCount : 0;
  }
}
