import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DraftPuzzle } from './entities/draft-puzzle.entity';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

@Injectable()
export class DraftPuzzleService {
  constructor(
    @InjectRepository(DraftPuzzle)
    private readonly draftRepo: Repository<DraftPuzzle>,
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

  async publish(id: string) {
    const draft = await this.findOne(id);
    if (draft.status !== 'approved') {
      throw new BadRequestException('Only approved drafts can be published.');
    }
    draft.status = 'published';
    await this.draftRepo.save(draft);
    return {
      event: 'PUZZLE_DRAFT_PUBLISHED',
      data: draft,
    };
  }
}
