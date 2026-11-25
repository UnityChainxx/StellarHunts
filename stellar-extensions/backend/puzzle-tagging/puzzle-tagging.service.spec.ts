import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PuzzleTaggingService } from './puzzle-tagging.service';
import { PuzzleTag } from './puzzle-tag.entity';
import { NotFoundException } from '@nestjs/common';

const mockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

describe('PuzzleTaggingService', () => {
  let service: PuzzleTaggingService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PuzzleTaggingService,
        { provide: getRepositoryToken(PuzzleTag), useFactory: mockRepo },
      ],
    }).compile();

    service = module.get<PuzzleTaggingService>(PuzzleTaggingService);
    repo = module.get(getRepositoryToken(PuzzleTag));
  });

  it('should create a new tag if it does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    const newTag = { id: 1, name: 'blockchain', usageCount: 0 };
    repo.create.mockReturnValue(newTag);
    repo.save.mockResolvedValue(newTag);

    const result = await service.createTag({ name: 'blockchain' });
    expect(result).toEqual(newTag);
    expect(repo.save).toHaveBeenCalled();
  });

  it('should return existing tag if it already exists', async () => {
    const existing = { id: 1, name: 'blockchain', usageCount: 5 };
    repo.findOne.mockResolvedValue(existing);

    const result = await service.createTag({ name: 'blockchain' });
    expect(result).toEqual(existing);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('should return tag cloud with count', async () => {
    const tags = [
      { name: 'blockchain', usageCount: 10 },
      { name: 'nft', usageCount: 5 },
    ];
    repo.find.mockResolvedValue(tags);

    const result = await service.tagCloud();
    expect(result).toEqual([
      { name: 'blockchain', count: 10 },
      { name: 'nft', count: 5 },
    ]);
  });

  it('should throw NotFoundException when searching non-existent tag', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.searchByTag('nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should autocomplete tags by prefix', async () => {
    repo.find.mockResolvedValue([{ name: 'blockchain', usageCount: 3 }]);
    const result = await service.autocomplete('block');
    expect(result).toEqual(['blockchain']);
  });
});
