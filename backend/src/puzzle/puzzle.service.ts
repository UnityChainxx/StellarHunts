import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Puzzle } from './puzzle.entity';
import { CreatePuzzleDto } from './dto/create-puzzle.dto';
import { UpdatePuzzleDto } from './dto/update-puzzle.dto';
import { sanitizeText } from '../common/sanitize-text';

@Injectable()
export class PuzzleService {
  constructor(
    @InjectRepository(Puzzle)
    private readonly puzzleRepository: Repository<Puzzle>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(createPuzzleDto: CreatePuzzleDto): Promise<Puzzle> {
    const puzzle = this.puzzleRepository.create(createPuzzleDto);
    puzzle.title = sanitizeText(puzzle.title);
    puzzle.description = sanitizeText(puzzle.description);
    puzzle.hint = puzzle.hint ? sanitizeText(puzzle.hint) : puzzle.hint;
    puzzle.solution = sanitizeText(puzzle.solution);
    return this.puzzleRepository.save(puzzle);
  }

  async findAllAdmin(): Promise<Puzzle[]> {
    return this.puzzleRepository.find();
  }

  async findOneAdmin(id: string): Promise<Puzzle> {
    const puzzle = await this.puzzleRepository.findOne({ where: { id } });
    if (!puzzle) throw new NotFoundException('Puzzle not found');
    return puzzle;
  }

  async update(
    id: string,
    updatePuzzleDto: UpdatePuzzleDto,
    actorId = 'system',
  ): Promise<Puzzle> {
    const puzzle = await this.findOneAdmin(id);
    if (puzzle.isActive && updatePuzzleDto.solution && updatePuzzleDto.solution !== puzzle.solution) {
      throw new BadRequestException('Cannot edit the solution of an active/published puzzle in place. Use versioned answer data.');
    }
    Object.assign(puzzle, updatePuzzleDto);
    const saved = await this.puzzleRepository.save(puzzle);
    await this.auditLogService.createLog(actorId, 'puzzle.update', {
      puzzleId: id,
    });
    return saved;
  }

  async remove(id: string, actorId = 'system'): Promise<void> {
    const puzzle = await this.findOneAdmin(id);
    await this.puzzleRepository.remove(puzzle);
    await this.auditLogService.createLog(actorId, 'puzzle.delete', {
      puzzleId: id,
    });
  }

  async findActive(difficulty?: string): Promise<Partial<Puzzle>[]> {
    const where: any = { isActive: true };
    if (difficulty) where.difficulty = difficulty;
    const puzzles = await this.puzzleRepository.find({ where });
    // Exclude solution and hint
    return puzzles.map(
      ({
        id,
        title,
        description,
        difficulty,
        rewardId,
        createdAt,
        updatedAt,
      }) => ({
        id,
        title,
        description,
        difficulty,
        rewardId,
        createdAt,
        updatedAt,
      }),
    );
  }
}
