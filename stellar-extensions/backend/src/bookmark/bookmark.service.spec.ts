import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookmarkService } from './bookmark.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

type Where<T> = Partial<Record<keyof T, unknown>>;

interface FindOptions<T> {
  where?: Where<T> | Where<T>[];
  relations?: string[];
  order?: Partial<Record<keyof T, 'ASC' | 'DESC'>>;
}

/** Minimal in-memory stand-in for the TypeORM repository surface used here. */
class InMemoryRepository<T extends Record<string, any>> {
  readonly rows: T[] = [];

  constructor(private readonly defaults: Partial<T> = {}) {}

  create(data: Partial<T>): T {
    return { ...this.defaults, ...data } as T;
  }

  async save(entity: T): Promise<T> {
    const stored = { ...entity } as T & { id?: string };
    if (!stored.id) stored.id = randomUUID();
    const index = this.rows.findIndex((row) => row.id === stored.id);
    if (index === -1) this.rows.push(stored);
    else this.rows[index] = stored;
    return { ...stored };
  }

  async remove(entity: T): Promise<T> {
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index !== -1) this.rows.splice(index, 1);
    return { ...entity };
  }

  async findOne(options: FindOptions<T> = {}): Promise<T | null> {
    const row = this.rows.find((candidate) =>
      this.matches(candidate, options.where),
    );
    return row ? { ...row } : null;
  }

  async find(options: FindOptions<T> = {}): Promise<T[]> {
    const rows = this.rows
      .filter((row) => this.matches(row, options.where))
      .map((row) => ({ ...row }));
    const [field, direction] = Object.entries(options.order ?? {})[0] ?? [];
    if (field && direction) {
      rows.sort((a, b) => {
        const left = a[field] instanceof Date ? a[field].getTime() : a[field];
        const right = b[field] instanceof Date ? b[field].getTime() : b[field];
        const order = left === right ? 0 : left > right ? 1 : -1;
        return direction === 'DESC' ? -order : order;
      });
    }
    return rows;
  }

  async update(criteria: Where<T>, patch: Partial<T>): Promise<void> {
    this.rows
      .filter((row) => this.matches(row, criteria))
      .forEach((row) => Object.assign(row, patch));
  }

  private matches(row: T, where?: Where<T> | Where<T>[]): boolean {
    if (!where) return true;
    const clauses = Array.isArray(where) ? where : [where];
    return clauses.some((clause) =>
      Object.entries(clause).every(([field, value]) => {
        // TypeORM's IsNull() operator, used by the "unfiled" bookmark filter.
        const operator = value as { type?: string } | null;
        if (operator && operator.type === 'isNull') return row[field] == null;
        return row[field] === value;
      }),
    );
  }
}

const PUZZLE_A = '11111111-1111-4111-8111-111111111111';
const PUZZLE_B = '22222222-2222-4222-8222-222222222222';

describe('BookmarkService', () => {
  let service: BookmarkService;
  let bookmarks: InMemoryRepository<any>;
  let folders: InMemoryRepository<any>;

  beforeEach(() => {
    bookmarks = new InMemoryRepository<any>({
      folderId: null,
      notes: null,
      isFavorite: false,
    });
    folders = new InMemoryRepository<any>({
      isPublic: false,
      shareSlug: null,
      bookmarks: [],
    });
    service = new BookmarkService(bookmarks as any, folders as any);
  });

  it('bookmarks a puzzle once and lists it for the owner', async () => {
    const bookmark = await service.bookmark('user-1', { puzzleId: PUZZLE_A });

    expect(bookmark).toMatchObject({
      userId: 'user-1',
      puzzleId: PUZZLE_A,
      folderId: null,
      isFavorite: false,
    });

    await expect(
      service.bookmark('user-1', { puzzleId: PUZZLE_A }),
    ).rejects.toBeInstanceOf(ConflictException);

    const mine = await service.listBookmarks('user-1');
    expect(mine).toHaveLength(1);
    expect(await service.listBookmarks('user-2')).toHaveLength(0);
  });

  it('unbookmarks a puzzle and rejects unknown bookmarks', async () => {
    await service.bookmark('user-1', { puzzleId: PUZZLE_A });

    await service.unbookmark('user-1', PUZZLE_A);
    expect(await service.listBookmarks('user-1')).toHaveLength(0);

    await expect(service.unbookmark('user-1', PUZZLE_A)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates custom folders and rejects duplicate names per user', async () => {
    const folder = await service.createFolder('user-1', {
      name: 'Hard puzzles',
    });
    expect(folder).toMatchObject({
      userId: 'user-1',
      name: 'Hard puzzles',
      isPublic: false,
      shareSlug: null,
    });

    await expect(
      service.createFolder('user-1', { name: 'Hard puzzles' }),
    ).rejects.toBeInstanceOf(ConflictException);

    // Folder names are scoped per user.
    await expect(
      service.createFolder('user-2', { name: 'Hard puzzles' }),
    ).resolves.toMatchObject({ userId: 'user-2' });

    expect(await service.listFolders('user-1')).toHaveLength(1);
  });

  it('moves bookmarks between folders and rejects foreign folders', async () => {
    const first = await service.createFolder('user-1', { name: 'First' });
    const second = await service.createFolder('user-1', { name: 'Second' });
    const foreign = await service.createFolder('user-2', { name: 'Theirs' });
    const bookmark = await service.bookmark('user-1', {
      puzzleId: PUZZLE_A,
      folderId: first.id,
    });

    const moved = await service.moveBookmark('user-1', bookmark.id, {
      folderId: second.id,
    });
    expect(moved.folderId).toBe(second.id);

    const unfiled = await service.moveBookmark('user-1', bookmark.id, {
      folderId: null,
    });
    expect(unfiled.folderId).toBeNull();

    await expect(
      service.moveBookmark('user-1', bookmark.id, { folderId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.bookmark('user-1', { puzzleId: PUZZLE_B, folderId: foreign.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters bookmarks by folder', async () => {
    const folder = await service.createFolder('user-1', { name: 'Later' });
    await service.bookmark('user-1', {
      puzzleId: PUZZLE_A,
      folderId: folder.id,
    });
    await service.bookmark('user-1', { puzzleId: PUZZLE_B });

    expect(await service.listBookmarks('user-1', folder.id)).toHaveLength(1);
    expect(await service.listBookmarks('user-1', 'unfiled')).toHaveLength(1);
  });

  it('shares a folder via link and serves it publicly', async () => {
    const folder = await service.createFolder('user-1', { name: 'Share me' });

    const link = await service.shareFolder('user-1', folder.id);
    expect(link.isPublic).toBe(true);
    expect(link.shareSlug).toMatch(/^[a-f0-9]{32}$/);
    expect(link.shareUrl).toBe(`/shared/bookmarks/${link.shareSlug}`);

    // Repeat sharing keeps the existing link valid.
    const again = await service.shareFolder('user-1', folder.id);
    expect(again.shareSlug).toBe(link.shareSlug);

    const shared = await service.getSharedCollection(link.shareSlug);
    expect(shared.id).toBe(folder.id);
    expect(shared.isPublic).toBe(true);
  });

  it('does not expose private folders through the shared endpoint', async () => {
    const folder = await service.createFolder('user-1', { name: 'Private' });

    expect(folder.shareSlug).toBeNull();
    await expect(
      service.getSharedCollection('unknown-slug'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('revokes the share link when a folder becomes private', async () => {
    const folder = await service.createFolder('user-1', {
      name: 'Was public',
      isPublic: true,
    });
    const slug = folder.shareSlug as string;
    expect(slug).not.toBeNull();

    const updated = await service.updateFolder('user-1', folder.id, {
      isPublic: false,
    });
    expect(updated.isPublic).toBe(false);
    expect(updated.shareSlug).toBeNull();
    await expect(service.getSharedCollection(slug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('unshares a published folder', async () => {
    const folder = await service.createFolder('user-1', { name: 'Shared' });
    const { shareSlug } = await service.shareFolder('user-1', folder.id);

    await service.unshareFolder('user-1', folder.id);

    await expect(
      service.getSharedCollection(shareSlug),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes a folder but keeps its bookmarks as unfiled', async () => {
    const folder = await service.createFolder('user-1', { name: 'Temporary' });
    const bookmark = await service.bookmark('user-1', {
      puzzleId: PUZZLE_A,
      folderId: folder.id,
    });

    await service.deleteFolder('user-1', folder.id);

    const remaining = await service.listBookmarks('user-1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: bookmark.id, folderId: null });
    expect(await service.listFolders('user-1')).toHaveLength(0);
  });
});
