import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../audit-log/audit-log.service';
import { DraftPuzzle } from './entities/draft-puzzle.entity';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

@Injectable()
export class DraftPuzzleService {
  constructor(
    @InjectRepository(DraftPuzzle)
    private readonly draftRepo: Repository<DraftPuzzle>,
    private readonly auditLogService: AuditLogService,
  ) {}

  create(createDto: CreateDraftDto, userId: string) {
    const draft = this.draftRepo.create({ ...createDto, createdBy: userId });
    return this.draftRepo.save(draft);
  }

  findAll() {
    return this.draftRepo.find();
  }

  async findOne(id: string) {
    const draft = await this.draftRepo.findOne({ where: { id } });
    if (!draft) throw new NotFoundException('Draft not found');
    return draft;
  }

  async update(id: string, updateDto: UpdateDraftDto) {
    const draft = await this.findOne(id);
    if (draft.status === 'published') {
      throw new BadRequestException('Cannot edit a published draft.');
    }
    
    if (updateDto.status) {
      const allowedTransitions: Record<string, string[]> = {
        draft: ['review'],
        review: ['draft', 'approved'],
        approved: ['review', 'published'],
        published: []
      };
      const allowed = allowedTransitions[draft.status] || [];
      if (!allowed.includes(updateDto.status)) {
        throw new BadRequestException(`Invalid status transition from ${draft.status} to ${updateDto.status}`);
      }
    }

    Object.assign(draft, updateDto);
    return this.draftRepo.save(draft);
  }

  async remove(id: string) {
    const draft = await this.findOne(id);
    return this.draftRepo.remove(draft);
  }

  async publish(id: string, actorId = 'system') {
    const draft = await this.findOne(id);
    // Emit event or return structured data for publishing module to handle.
    // Publishing is an admin-only action; record it in the immutable audit
    // log so every published draft keeps a permanent, attributable trace.
    await this.auditLogService.createLog(actorId, 'puzzle-draft.publish', {
      draftId: draft.id,
      title: draft.title,
    });
    return {
      event: 'PUZZLE_DRAFT_PUBLISHED',
      data: draft,
    };
  }
}
