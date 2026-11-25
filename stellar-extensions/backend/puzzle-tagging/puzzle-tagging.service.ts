import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { PuzzleTag } from './puzzle-tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class PuzzleTaggingService {
  constructor(
    @InjectRepository(PuzzleTag)
    private tagRepository: Repository<PuzzleTag>,
  ) {}

  async createTag(dto: CreateTagDto): Promise<PuzzleTag> {
    const existing = await this.tagRepository.findOne({ where: { name: dto.name } });
    if (existing) return existing;
    const tag = this.tagRepository.create({ name: dto.name });
    return this.tagRepository.save(tag);
  }

  async addTagsToPuzzle(puzzleId: string, tagNames: string[]): Promise<{ puzzleId: string; tags: string[] }> {
    // Upsert each tag and increment usage count
    for (const name of tagNames) {
      let tag = await this.tagRepository.findOne({ where: { name } });
      if (!tag) {
        tag = this.tagRepository.create({ name, usageCount: 1 });
      } else {
        tag.usageCount += 1;
      }
      await this.tagRepository.save(tag);
    }
    return { puzzleId, tags: tagNames };
  }

  async removeTagFromPuzzle(puzzleId: string, tagName: string): Promise<void> {
    const tag = await this.tagRepository.findOne({ where: { name: tagName } });
    if (tag && tag.usageCount > 0) {
      tag.usageCount -= 1;
      await this.tagRepository.save(tag);
    }
  }

  async searchByTag(tagName: string): Promise<{ tag: string; puzzleCount: number }> {
    const tag = await this.tagRepository.findOne({ where: { name: tagName } });
    if (!tag) throw new NotFoundException(`Tag "${tagName}" not found`);
    return { tag: tagName, puzzleCount: tag.usageCount };
  }

  async autocomplete(prefix: string): Promise<string[]> {
    const tags = await this.tagRepository.find({
      where: { name: ILike(`${prefix}%`) },
      order: { usageCount: 'DESC' },
      take: 10,
    });
    return tags.map((t) => t.name);
  }

  async tagCloud(): Promise<Array<{ name: string; count: number }>> {
    const tags = await this.tagRepository.find({
      where: {},
      order: { usageCount: 'DESC' },
      take: 50,
    });
    return tags.map((t) => ({ name: t.name, count: t.usageCount }));
  }

  async mergeTags(sourceTag: string, targetTag: string): Promise<void> {
    const source = await this.tagRepository.findOne({ where: { name: sourceTag } });
    const target = await this.tagRepository.findOne({ where: { name: targetTag } });
    if (!source) throw new NotFoundException(`Tag "${sourceTag}" not found`);
    if (!target) throw new NotFoundException(`Tag "${targetTag}" not found`);
    target.usageCount += source.usageCount;
    await this.tagRepository.save(target);
    await this.tagRepository.remove(source);
  }

  async deleteTag(tagName: string): Promise<void> {
    const tag = await this.tagRepository.findOne({ where: { name: tagName } });
    if (!tag) throw new NotFoundException(`Tag "${tagName}" not found`);
    await this.tagRepository.remove(tag);
  }
}
