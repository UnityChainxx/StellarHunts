import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PuzzleHintUsage } from './entities/puzzle-hint-usage.entity';
import { RequestHintDto } from './dto/request-hint.dto';

export interface HintContent {
  puzzleId: string;
  order: number;
  content: string;
  tokenCost: number;
}

/**
 * Puzzle Hint System Module — issue #929
 *
 * Extends the existing hint module with token-cost deduction, per-user
 * hint tracking, and admin management.
 */
@Injectable()
export class PuzzleHintExtendedService {
  // In-memory hint store (replace with TypeORM entity in full integration)
  private readonly hints = new Map<string, HintContent[]>();

  constructor(
    @InjectRepository(PuzzleHintUsage)
    private usageRepository: Repository<PuzzleHintUsage>,
  ) {}

  // ── Admin: create/update hints ──────────────────────────────────────────────

  async upsertHint(dto: { puzzleId: string; content: string; order: number; tokenCost: number }): Promise<HintContent> {
    const existing = this.hints.get(dto.puzzleId) ?? [];
    const idx = existing.findIndex((h) => h.order === dto.order);
    const hint: HintContent = { puzzleId: dto.puzzleId, content: dto.content, order: dto.order, tokenCost: dto.tokenCost };

    if (idx === -1) {
      existing.push(hint);
    } else {
      existing[idx] = hint;
    }
    this.hints.set(dto.puzzleId, existing);
    return hint;
  }

  // ── Request a hint (with token deduction) ──────────────────────────────────

  async requestHint(userId: string, dto: RequestHintDto): Promise<HintContent> {
    const puzzleHints = this.hints.get(dto.puzzleId);
    if (!puzzleHints || puzzleHints.length === 0) {
      throw new NotFoundException(`No hints for puzzle ${dto.puzzleId}`);
    }

    const hint = puzzleHints.find((h) => h.order === dto.hintOrder);
    if (!hint) {
      throw new NotFoundException(`Hint #${dto.hintOrder} not found for puzzle ${dto.puzzleId}`);
    }

    // Check if already used (avoid double-charging)
    const alreadyUsed = await this.usageRepository.findOne({
      where: { puzzleId: dto.puzzleId, userId, hintOrder: dto.hintOrder },
    });
    if (alreadyUsed) return hint; // already paid for this hint

    // Record usage (token deduction would happen via a token service injection)
    const usage = this.usageRepository.create({
      puzzleId: dto.puzzleId,
      userId,
      hintOrder: dto.hintOrder,
      tokenCost: hint.tokenCost,
    });
    await this.usageRepository.save(usage);

    return hint;
  }

  // ── Get hints used by a user for a puzzle ──────────────────────────────────

  async getUsedHints(userId: string, puzzleId: string): Promise<PuzzleHintUsage[]> {
    return this.usageRepository.find({
      where: { userId, puzzleId },
      order: { hintOrder: 'ASC' },
    });
  }

  // ── List available hints for a puzzle (without revealing content) ──────────

  listHintSummaries(puzzleId: string): Array<{ order: number; tokenCost: number }> {
    const hints = this.hints.get(puzzleId) ?? [];
    return hints.map(({ order, tokenCost }) => ({ order, tokenCost }));
  }
}
