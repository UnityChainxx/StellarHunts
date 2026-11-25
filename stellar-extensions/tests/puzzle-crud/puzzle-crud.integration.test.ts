/**
 * Integration tests for the full puzzle lifecycle:
 *
 *   create draft -> add test cases -> submit for review ->
 *   admin approve/reject -> publish -> update -> delete -> fork
 *
 * The suite wires the real backend services together
 * (`backend/src/puzzle-draft`, `backend/src/puzzle-test-case`,
 * `backend/src/moderation` in stellar-extensions, `backend/src/puzzle` and
 * `backend/src/puzzle-fork`) against in-memory repositories, so it runs in CI
 * without a database or a live API — same approach as the referral suite.
 */

import "reflect-metadata";

import { randomUUID } from "crypto";
import { BadRequestException, ConflictException } from "@nestjs/common";

import { DraftPuzzleService } from "../../../backend/src/puzzle-draft/draft-puzzle.service";
import { PuzzleService } from "../../../backend/src/puzzle/puzzle.service";
import { PuzzleForkService } from "../../../backend/src/puzzle-fork/puzzle-fork.service";
import { PuzzleTestCaseService } from "../../../backend/src/puzzle-test-case/services/puzzle-test-case.service";
import { TestCaseType } from "../../../backend/src/puzzle-test-case/entities/puzzle-test-case.entity";
import {
  ModerationAction,
  ModerationStatus,
} from "../../backend/src/moderation/entities/moderation-queue-item.entity";
import { ModerationService } from "../../backend/src/moderation/moderation.service";
import type { SubmitPuzzleDto } from "../../backend/src/moderation/dto/submit-puzzle.dto";
import type { ReviewDecisionDto } from "../../backend/src/moderation/dto/review-decision.dto";
import { InMemoryRepository } from "./in-memory-repository";

const AUTHOR = "author-user-1";
const MODERATOR = "moderator-user-1";

function createStack() {
  const draftRepo = new InMemoryRepository<any>({ status: "draft" });
  const testCaseRepo = new InMemoryRepository<any>({
    testCaseType: TestCaseType.BASIC,
    validationMode: "exact_match",
    isActive: true,
    isHidden: false,
    isSample: false,
    weight: 1,
    timeoutMs: 1000,
    memoryLimitMB: 128,
    executionOrder: 0,
  });
  const queueRepo = new InMemoryRepository<any>({});
  const checkLogRepo = new InMemoryRepository<any>({});
  const decisionRepo = new InMemoryRepository<any>({});
  const puzzleRepo = new InMemoryRepository<any>({ isActive: true });
  const forkRepo = new InMemoryRepository<any>({});
  const versionRepo = new InMemoryRepository<any>({});

  const auditLogService = { createLog: async () => ({}) };

  const draftService = new DraftPuzzleService(draftRepo as any, auditLogService as any);
  const testCaseService = new PuzzleTestCaseService(testCaseRepo as any);
  const moderationService = new ModerationService(
    queueRepo as any,
    checkLogRepo as any,
    decisionRepo as any,
  );
  const puzzleService = new PuzzleService(puzzleRepo as any, auditLogService as any);
  const forkService = new PuzzleForkService(forkRepo as any, versionRepo as any);

  return {
    draftService,
    testCaseService,
    moderationService,
    puzzleService,
    forkService,
    draftRepo,
    testCaseRepo,
    queueRepo,
    checkLogRepo,
    decisionRepo,
    puzzleRepo,
    forkRepo,
    versionRepo,
  };
}

type Stack = ReturnType<typeof createStack>;

/** Drive a draft through draft -> review -> approved. */
async function advanceDraft(stack: Stack, draftId: string) {
  await stack.draftService.update(draftId, { status: "review" });
  await stack.draftService.update(draftId, { status: "approved" });
}

function submitDto(puzzleId: string, overrides: Partial<SubmitPuzzleDto> = {}): SubmitPuzzleDto {
  return {
    puzzleId,
    title: "Soroban storage rollover",
    description: "Find the storage bug in this contract.",
    ...overrides,
  };
}

describe("puzzle CRUD lifecycle integration", () => {
  describe("draft creation", () => {
    it("creates a puzzle draft in 'draft' status", async () => {
      const stack = createStack();

      const draft = await stack.draftService.create(
        {
          title: "First contract puzzle",
          description: "A gentle intro",
          content: { kind: "soroban", difficulty: "easy" },
        },
        AUTHOR,
      );

      expect(draft.id).toBeTruthy();
      expect(draft.status).toBe("draft");
      expect(draft.createdBy).toBe(AUTHOR);
      expect(stack.draftRepo.rows).toHaveLength(1);
    });
  });

  describe("test cases", () => {
    it("adds test cases to a draft", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );

      const first = await stack.testCaseService.createTestCase({
        puzzleId: draft.id,
        title: "happy path",
        input: { parameters: [1, 2] },
        expectedOutput: { result: 3 },
        isSample: true,
      });
      const second = await stack.testCaseService.createTestCase({
        puzzleId: draft.id,
        title: "edge case",
        testCaseType: TestCaseType.EDGE_CASE,
        input: { parameters: [] },
        expectedOutput: { result: 0 },
        isHidden: true,
      });

      expect(first.puzzleId).toBe(draft.id);
      expect(second.puzzleId).toBe(draft.id);
      expect(stack.testCaseRepo.rows).toHaveLength(2);
    });
  });

  describe("review submission and moderation", () => {
    it("moves the draft to 'review' and enqueues it for moderation", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );

      await stack.draftService.update(draft.id, { status: "review" });
      const item = await stack.moderationService.submit(
        submitDto(draft.id),
        AUTHOR,
      );

      expect(item.status).toBe(ModerationStatus.PENDING);
      expect(item.puzzleId).toBe(draft.id);
      expect(item.submittedBy).toBe(AUTHOR);
      // Automated checks are logged for the audit trail.
      expect(stack.checkLogRepo.rows.length).toBeGreaterThanOrEqual(2);
    });

    it("lets a moderator approve the submission", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      const item = await stack.moderationService.submit(
        submitDto(draft.id),
        AUTHOR,
      );
      await stack.moderationService.assign(item.id, { moderatorId: MODERATOR });

      const decision: ReviewDecisionDto = { action: ModerationAction.APPROVE };
      const result = await stack.moderationService.review(
        item.id,
        MODERATOR,
        decision,
      );

      expect(result.item.status).toBe(ModerationStatus.APPROVED);
      expect(result.item.decidedAt).toBeInstanceOf(Date);
      expect(result.decision.action).toBe(ModerationAction.APPROVE);
      expect(stack.decisionRepo.rows).toHaveLength(1);
    });

    it("lets a moderator reject the submission with a reason", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      const item = await stack.moderationService.submit(
        submitDto(draft.id),
        AUTHOR,
      );

      const decision: ReviewDecisionDto = {
        action: ModerationAction.REJECT,
        reason: "Description is incomplete",
      };
      const result = await stack.moderationService.review(
        item.id,
        MODERATOR,
        decision,
      );

      expect(result.item.status).toBe(ModerationStatus.REJECTED);
      expect(result.item.decisionReason).toBe("Description is incomplete");
    });

    it("requires a reason for non-approve decisions", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      const item = await stack.moderationService.submit(
        submitDto(draft.id),
        AUTHOR,
      );

      await expect(
        stack.moderationService.review(item.id, MODERATOR, {
          action: ModerationAction.REJECT,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("allows a rejected puzzle to be resubmitted", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      const item = await stack.moderationService.submit(
        submitDto(draft.id),
        AUTHOR,
      );
      await stack.moderationService.review(item.id, MODERATOR, {
        action: ModerationAction.REJECT,
        reason: "fix it",
      });

      const resubmitted = await stack.moderationService.submit(
        submitDto(draft.id, { title: "Puzzle (revised)" }),
        AUTHOR,
      );

      expect(resubmitted.status).toBe(ModerationStatus.PENDING);
      expect(resubmitted.title).toBe("Puzzle (revised)");
      // Same queue row is reused — the puzzleId unique index holds.
      expect(stack.queueRepo.rows).toHaveLength(1);
    });
  });

  describe("publish, update and delete", () => {
    it("publishes an approved draft and emits the publish event", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      await advanceDraft(stack, draft.id);

      const published = await stack.draftService.publish(draft.id, MODERATOR);
      expect(published.event).toBe("PUZZLE_DRAFT_PUBLISHED");
      expect(published.data.id).toBe(draft.id);
    });

    it("rejects invalid draft status transitions", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );

      await expect(
        stack.draftService.update(draft.id, { status: "published" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("creates, updates and deletes a published puzzle", async () => {
      const stack = createStack();

      const puzzle = await stack.puzzleService.create({
        title: "Live puzzle",
        description: "Playable now",
        difficulty: "medium",
        solution: "open-sesame",
        hint: "say the magic word",
      });
      expect(puzzle.isActive).toBe(true);

      const updated = await stack.puzzleService.update(puzzle.id, {
        title: "Live puzzle (updated)",
        difficulty: "hard",
      });
      expect(updated.title).toBe("Live puzzle (updated)");
      expect(updated.difficulty).toBe("hard");

      // Solutions of active puzzles cannot be edited in place.
      await expect(
        stack.puzzleService.update(puzzle.id, { solution: "new-answer" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await stack.puzzleService.remove(puzzle.id, MODERATOR);
      await expect(stack.puzzleService.findOneAdmin(puzzle.id)).rejects.toThrow(
        "Puzzle not found",
      );
      expect(stack.puzzleRepo.rows).toHaveLength(0);
    });
  });

  describe("forking", () => {
    it("forks the latest version of an existing puzzle", async () => {
      const stack = createStack();
      const puzzleId = "11111111-2222-3333-4444-555555555555";
      stack.versionRepo.rows.push(
        {
          id: "v1",
          puzzleId,
          version: 1,
          title: "Original puzzle",
          content: { prompt: "v1" },
          createdAt: new Date("2026-01-01"),
        } as any,
        {
          id: "v2",
          puzzleId,
          version: 2,
          title: "Original puzzle",
          content: { prompt: "v2" },
          createdAt: new Date("2026-02-01"),
        } as any,
      );

      const fork = await stack.forkService.fork({
        originalPuzzleId: puzzleId,
        newTitle: "My fork",
      });

      expect(fork.title).toBe("My fork");
      expect(fork.originalPuzzleId).toBe(puzzleId);
      // Latest version wins when no explicit version is requested.
      expect(fork.forkedFromVersion).toBe(2);
      expect(fork.content).toEqual({ prompt: "v2" });
      expect(stack.forkRepo.rows).toHaveLength(1);
    });

    it("forks a specific version on request", async () => {
      const stack = createStack();
      const puzzleId = "11111111-2222-3333-4444-555555555555";
      stack.versionRepo.rows.push({
        id: "v1",
        puzzleId,
        version: 1,
        title: "Original puzzle",
        content: { prompt: "v1" },
        createdAt: new Date("2026-01-01"),
      } as any);

      const fork = await stack.forkService.fork({
        originalPuzzleId: puzzleId,
        version: 1,
      });

      expect(fork.forkedFromVersion).toBe(1);
      expect(fork.title).toBe("Fork of: Original puzzle");
    });

    it("rejects forking an unknown puzzle", async () => {
      const stack = createStack();
      await expect(
        stack.forkService.fork({ originalPuzzleId: randomUUID() }),
      ).rejects.toThrow("not found");
    });
  });

  describe("duplicate submission guard", () => {
    it("rejects a second moderation submission for the same puzzle", async () => {
      const stack = createStack();
      const draft = await stack.draftService.create(
        { title: "Puzzle", content: {} },
        AUTHOR,
      );
      await stack.moderationService.submit(submitDto(draft.id), AUTHOR);

      await expect(
        stack.moderationService.submit(submitDto(draft.id), AUTHOR),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
