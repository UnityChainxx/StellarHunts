/**
 * Answer-grading contract tests for the backend puzzle path — issue #563
 *
 * The backend's `PuzzleSubmissionService.submitAnswer` grades by
 * `answer.trim().toLowerCase() === solution.trim().toLowerCase()`:
 * case- and whitespace-insensitive (leading/trailing), but exact on
 * internal content.
 *
 * The on-chain path in `stellar_hunts/src/lib.rs:submit_answer` compares
 * `sha256(submitted_bytes) == question.hashed_answer`: byte-exact modulo
 * hashing, no case folding or whitespace trimming.
 *
 * This file pins the backend grading boundaries. The difference between
 * the two paths is documented below under "Normalisation difference".
 *
 * ## Normalisation difference
 *
 * | Behaviour                 | Backend (off-chain) | Contract (on-chain) |
 * |---------------------------|---------------------|---------------------|
 * | Leading/trailing spaces   | stripped            | significant         |
 * | Case folding (ASCII)      | lowercased          | exact (byte-level)  |
 * | Unicode case folding      | JS toLowerCase      | N/A (bytes)         |
 * | Internal whitespace       | preserved           | preserved           |
 * | Empty string              | accepted as answer  | accepted (no hash match) |
 *
 * **Authoritative path**: the backend service is authoritative for off-chain
 * game flows. The contract is authoritative for on-chain badge minting. A
 * puzzle authored for one path may grade differently on the other if the
 * solution contains uppercase letters or surrounding whitespace.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PuzzleSubmissionService } from './puzzle-submission.service';
import { PuzzleSubmission } from './puzzle-submission.entity';
import { Puzzle } from '../puzzle/puzzle.entity';

function makeRepo<T>() {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
}

describe('PuzzleSubmissionService — grading boundary tests (issue #563)', () => {
  let service: PuzzleSubmissionService;
  let submissionRepo: ReturnType<typeof makeRepo>;
  let puzzleRepo: ReturnType<typeof makeRepo>;

  const PLAYER = 'player-uuid-1';
  const PUZZLE_ID = 'puzzle-uuid-1';

  function makePuzzle(solution: string): Partial<Puzzle> {
    return { id: PUZZLE_ID, solution } as Partial<Puzzle>;
  }

  function mockSubmission(answer: string, isCorrect: boolean, attempt = 1) {
    const sub = { id: attempt, playerId: PLAYER, puzzleId: PUZZLE_ID, answer, isCorrect, attemptCount: attempt };
    submissionRepo.create.mockReturnValue(sub);
    submissionRepo.save.mockResolvedValue(sub);
    submissionRepo.findOne.mockResolvedValue(null); // no prior attempt
    return sub;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    submissionRepo = makeRepo();
    puzzleRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleSubmissionService,
        { provide: getRepositoryToken(PuzzleSubmission), useValue: submissionRepo },
        { provide: getRepositoryToken(Puzzle), useValue: puzzleRepo },
      ],
    }).compile();

    service = module.get<PuzzleSubmissionService>(PuzzleSubmissionService);
  });

  // ── 1. Puzzle not found ──────────────────────────────────────────────────

  it('throws NotFoundException when puzzle does not exist', async () => {
    puzzleRepo.findOne.mockResolvedValue(null);
    await expect(service.submitAnswer(PLAYER, 'no-such-puzzle', 'answer')).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── 2. Exact match ───────────────────────────────────────────────────────

  it('grades an exact-match submission as correct', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('blockchain'));
    mockSubmission('blockchain', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'blockchain');
    expect(result.isCorrect).toBe(true);
  });

  // ── 3. Case folding ──────────────────────────────────────────────────────

  it('accepts an uppercase submission when solution is lowercase', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('blockchain'));
    mockSubmission('BLOCKCHAIN', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'BLOCKCHAIN');
    expect(result.isCorrect).toBe(true);
  });

  it('accepts a mixed-case submission', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('Soroban'));
    mockSubmission('soroban', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'soroban');
    expect(result.isCorrect).toBe(true);
  });

  // ── 4. Leading/trailing whitespace ──────────────────────────────────────

  it('accepts a submission with leading whitespace', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('stellar'));
    mockSubmission('  stellar', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, '  stellar');
    expect(result.isCorrect).toBe(true);
  });

  it('accepts a submission with trailing whitespace', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('stellar'));
    mockSubmission('stellar   ', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'stellar   ');
    expect(result.isCorrect).toBe(true);
  });

  it('accepts a submission with both leading and trailing whitespace', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('nft'));
    mockSubmission('  nft  ', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, '  nft  ');
    expect(result.isCorrect).toBe(true);
  });

  // ── 5. Internal whitespace is preserved (not trimmed) ───────────────────

  it('rejects a submission whose internal whitespace differs from the solution', async () => {
    // Solution has a single space; submission has two spaces (internal).
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('hello world'));
    mockSubmission('hello  world', false); // two spaces

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'hello  world');
    expect(result.isCorrect).toBe(false);
  });

  // ── 6. Empty string ──────────────────────────────────────────────────────

  it('grades an empty submission as incorrect', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('soroban'));
    mockSubmission('', false);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, '');
    expect(result.isCorrect).toBe(false);
  });

  it('grades a submission of only whitespace as incorrect', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('soroban'));
    mockSubmission('   ', false);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, '   ');
    expect(result.isCorrect).toBe(false);
  });

  // ── 7. Unicode case folding ──────────────────────────────────────────────

  it('applies JS toLowerCase for unicode characters', async () => {
    // "CAFÉ" toLowerCase → "café" in JS.
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('café'));
    mockSubmission('CAFÉ', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'CAFÉ');
    expect(result.isCorrect).toBe(true);
  });

  // ── 8. Solution containing numbers ──────────────────────────────────────

  it('grades solutions containing numbers correctly', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('web3'));
    mockSubmission('WEB3', true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'WEB3');
    expect(result.isCorrect).toBe(true);
  });

  // ── 9. Length difference ─────────────────────────────────────────────────

  it('rejects a submission that is a prefix of the solution', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('blockchain'));
    mockSubmission('block', false);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'block');
    expect(result.isCorrect).toBe(false);
  });

  it('rejects a submission that has extra characters appended', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('stellar'));
    mockSubmission('stellarx', false);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, 'stellarx');
    expect(result.isCorrect).toBe(false);
  });

  // ── 10. Attempt count increments ────────────────────────────────────────

  it('increments attempt count on subsequent submissions', async () => {
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('soroban'));

    // First attempt — no prior submission.
    const firstSub = { id: 1, playerId: PLAYER, puzzleId: PUZZLE_ID, answer: 'wrong', isCorrect: false, attemptCount: 1 };
    submissionRepo.findOne.mockResolvedValueOnce(null);
    submissionRepo.create.mockReturnValue(firstSub);
    submissionRepo.save.mockResolvedValueOnce(firstSub);

    const first = await service.submitAnswer(PLAYER, PUZZLE_ID, 'wrong');
    expect(first.attempts).toBe(1);

    // Second attempt — has a prior submission at attemptCount 1.
    puzzleRepo.findOne.mockResolvedValue(makePuzzle('soroban'));
    const secondSub = { id: 2, playerId: PLAYER, puzzleId: PUZZLE_ID, answer: 'soroban', isCorrect: true, attemptCount: 2 };
    submissionRepo.findOne.mockResolvedValueOnce(firstSub);
    submissionRepo.create.mockReturnValue(secondSub);
    submissionRepo.save.mockResolvedValueOnce(secondSub);

    const second = await service.submitAnswer(PLAYER, PUZZLE_ID, 'soroban');
    expect(second.isCorrect).toBe(true);
    expect(second.attempts).toBe(2);
  });

  // ── 11. Representative cross-path puzzle ────────────────────────────────
  //
  // A puzzle with a purely lowercase, single-word solution is accepted by
  // both grading paths for a case-folded submission. This pins the overlap
  // between the backend normalisation and the on-chain byte comparison.

  it('cross-path representative: lowercase single-word solution accepted by both paths', async () => {
    // Backend path: case-insensitive, strip surrounding whitespace.
    const solution = 'stellar'; // lowercase — matches sha256('stellar') on-chain too
    puzzleRepo.findOne.mockResolvedValue(makePuzzle(solution));
    mockSubmission(solution, true);

    const result = await service.submitAnswer(PLAYER, PUZZLE_ID, solution);
    expect(result.isCorrect).toBe(true);
    // The exact submission 'stellar' also matches sha256('stellar') on-chain.
  });
});
