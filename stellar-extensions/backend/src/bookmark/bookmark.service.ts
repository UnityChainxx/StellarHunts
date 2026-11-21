import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { CreateBookmarkFolderDto } from './dto/create-bookmark-folder.dto';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { MoveBookmarkDto } from './dto/move-bookmark.dto';
import { UpdateBookmarkFolderDto } from './dto/update-bookmark-folder.dto';
import { BookmarkFolder } from './entities/bookmark-folder.entity';
import { PuzzleBookmark } from './entities/puzzle-bookmark.entity';

/** Public path where a shared folder is exposed. */
export const SHARED_FOLDER_PATH = '/shared/bookmarks';

export interface FolderShareLink {
  folderId: string;
  shareSlug: string;
  shareUrl: string;
  isPublic: boolean;
}

@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(PuzzleBookmark)
    private readonly bookmarks: Repository<PuzzleBookmark>,
    @InjectRepository(BookmarkFolder)
    private readonly folders: Repository<BookmarkFolder>,
  ) {}

  // ── bookmarks ──────────────────────────────────────────────────────────────

  async bookmark(
    userId: string,
    dto: CreateBookmarkDto,
  ): Promise<PuzzleBookmark> {
    if (dto.folderId) {
      await this.findOwnedFolder(userId, dto.folderId);
    }

    const existing = await this.bookmarks.findOne({
      where: { userId, puzzleId: dto.puzzleId },
    });
    if (existing) {
      throw new ConflictException('Puzzle is already bookmarked');
    }

    const bookmark = this.bookmarks.create({
      userId,
      puzzleId: dto.puzzleId,
      folderId: dto.folderId ?? null,
      notes: dto.notes ?? null,
      isFavorite: dto.isFavorite ?? false,
    });
    return this.bookmarks.save(bookmark);
  }

  async unbookmark(userId: string, puzzleId: string): Promise<void> {
    const bookmark = await this.bookmarks.findOne({
      where: { userId, puzzleId },
    });
    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }
    await this.bookmarks.remove(bookmark);
  }

  async listBookmarks(
    userId: string,
    folderId?: string,
  ): Promise<PuzzleBookmark[]> {
    const where: FindOptionsWhere<PuzzleBookmark> = { userId };
    if (folderId === 'unfiled') {
      where.folderId = IsNull();
    } else if (folderId) {
      await this.findOwnedFolder(userId, folderId);
      where.folderId = folderId;
    }

    return this.bookmarks.find({
      where,
      relations: ['folder'],
      order: { createdAt: 'DESC' },
    });
  }

  async moveBookmark(
    userId: string,
    bookmarkId: string,
    dto: MoveBookmarkDto,
  ): Promise<PuzzleBookmark> {
    const bookmark = await this.bookmarks.findOne({
      where: { id: bookmarkId, userId },
    });
    if (!bookmark) {
      throw new NotFoundException('Bookmark not found');
    }

    if (dto.folderId) {
      await this.findOwnedFolder(userId, dto.folderId);
    }

    bookmark.folderId = dto.folderId ?? null;
    return this.bookmarks.save(bookmark);
  }

  // ── folders ────────────────────────────────────────────────────────────────

  async createFolder(
    userId: string,
    dto: CreateBookmarkFolderDto,
  ): Promise<BookmarkFolder> {
    const duplicate = await this.folders.findOne({
      where: { userId, name: dto.name },
    });
    if (duplicate) {
      throw new ConflictException(
        `A folder named "${dto.name}" already exists`,
      );
    }

    const isPublic = dto.isPublic ?? false;
    const folder = this.folders.create({
      userId,
      name: dto.name,
      isPublic,
      shareSlug: isPublic ? this.generateSlug() : null,
    });
    return this.folders.save(folder);
  }

  async listFolders(userId: string): Promise<BookmarkFolder[]> {
    return this.folders.find({
      where: { userId },
      relations: ['bookmarks'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateFolder(
    userId: string,
    folderId: string,
    dto: UpdateBookmarkFolderDto,
  ): Promise<BookmarkFolder> {
    const folder = await this.findOwnedFolder(userId, folderId);

    if (dto.name !== undefined && dto.name !== folder.name) {
      const duplicate = await this.folders.findOne({
        where: { userId, name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException(
          `A folder named "${dto.name}" already exists`,
        );
      }
      folder.name = dto.name;
    }

    if (dto.isPublic !== undefined) {
      folder.isPublic = dto.isPublic;
      if (dto.isPublic) {
        folder.shareSlug = folder.shareSlug ?? this.generateSlug();
      } else {
        // Making a folder private revokes any previously shared link.
        folder.shareSlug = null;
      }
    }

    return this.folders.save(folder);
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const folder = await this.findOwnedFolder(userId, folderId);

    // Keep the bookmarks; they simply become unfiled.
    await this.bookmarks.update({ folderId: folder.id }, { folderId: null });
    await this.folders.remove(folder);
  }

  // ── sharing ────────────────────────────────────────────────────────────────

  /**
   * Publish a folder and return its share link. Repeated calls are idempotent
   * and keep the same slug, so links already handed out stay valid.
   */
  async shareFolder(
    userId: string,
    folderId: string,
  ): Promise<FolderShareLink> {
    const folder = await this.findOwnedFolder(userId, folderId);
    if (!folder.shareSlug) folder.shareSlug = this.generateSlug();
    folder.isPublic = true;

    const saved = await this.folders.save(folder);
    return this.toShareLink(saved);
  }

  async unshareFolder(userId: string, folderId: string): Promise<void> {
    const folder = await this.findOwnedFolder(userId, folderId);
    folder.isPublic = false;
    folder.shareSlug = null;
    await this.folders.save(folder);
  }

  /** Public, unauthenticated view of a shared collection. */
  async getSharedCollection(slug: string): Promise<BookmarkFolder> {
    const folder = await this.folders.findOne({
      where: { shareSlug: slug, isPublic: true },
      relations: ['bookmarks'],
    });
    if (!folder) {
      throw new NotFoundException('Shared bookmark collection not found');
    }
    return folder;
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async findOwnedFolder(
    userId: string,
    folderId: string,
  ): Promise<BookmarkFolder> {
    const folder = await this.folders.findOne({
      where: { id: folderId, userId },
    });
    if (!folder) {
      throw new NotFoundException('Bookmark folder not found');
    }
    return folder;
  }

  private generateSlug(): string {
    return randomBytes(16).toString('hex');
  }

  private toShareLink(folder: BookmarkFolder): FolderShareLink {
    return {
      folderId: folder.id,
      shareSlug: folder.shareSlug as string,
      shareUrl: `${SHARED_FOLDER_PATH}/${folder.shareSlug}`,
      isPublic: folder.isPublic,
    };
  }
}
