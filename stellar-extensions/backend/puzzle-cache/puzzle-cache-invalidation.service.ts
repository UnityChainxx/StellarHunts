import { Injectable, Logger } from '@nestjs/common';

export interface CacheInvalidationOptions {
  puzzleId?: string;
  categoryId?: string;
  tags?: string[];
  batch?: string[];
}

/**
 * Puzzle Cache Invalidation Service (issue #953)
 *
 * Manages cache invalidation for puzzle data across Redis and CDN layers
 * when puzzles are updated, published, or unpublished.
 */
@Injectable()
export class PuzzleCacheInvalidationService {
  private readonly logger = new Logger(PuzzleCacheInvalidationService.name);

  // In production this would be injected via Redis client / CDN SDK.
  // We use an in-memory Map for the extension to stay self-contained.
  private readonly cache = new Map<string, unknown>();

  private buildPuzzleKey(puzzleId: string): string {
    return `puzzle:${puzzleId}`;
  }

  private buildCategoryKey(categoryId: string): string {
    return `category:${categoryId}`;
  }

  private buildSearchKey(tag: string): string {
    return `search:tag:${tag}`;
  }

  /**
   * Invalidate cache for a single puzzle after update.
   */
  async invalidatePuzzle(puzzleId: string): Promise<void> {
    const key = this.buildPuzzleKey(puzzleId);
    this.cache.delete(key);
    this.logger.log(`Cache invalidated for puzzle ${puzzleId}`);
  }

  /**
   * Invalidate category cache when puzzle category changes.
   */
  async invalidateCategory(categoryId: string): Promise<void> {
    const key = this.buildCategoryKey(categoryId);
    this.cache.delete(key);
    this.logger.log(`Cache invalidated for category ${categoryId}`);
  }

  /**
   * Invalidate search index for published/unpublished puzzles.
   */
  async invalidateSearchIndex(puzzleId: string): Promise<void> {
    const searchKey = `search:puzzle:${puzzleId}`;
    this.cache.delete(searchKey);
    this.logger.log(`Search index invalidated for puzzle ${puzzleId}`);
  }

  /**
   * Invalidate all cache entries that contain the given tag.
   */
  async invalidateByTag(tag: string): Promise<void> {
    const key = this.buildSearchKey(tag);
    this.cache.delete(key);
    // Also clear any puzzle:* keys that referenced this tag
    for (const cacheKey of this.cache.keys()) {
      if (cacheKey.startsWith('tag:') && cacheKey.includes(tag)) {
        this.cache.delete(cacheKey);
      }
    }
    this.logger.log(`Cache invalidated for tag "${tag}"`);
  }

  /**
   * Batch invalidation for bulk puzzle updates.
   */
  async invalidateBatch(puzzleIds: string[]): Promise<void> {
    for (const id of puzzleIds) {
      await this.invalidatePuzzle(id);
    }
    this.logger.log(`Batch cache invalidation completed for ${puzzleIds.length} puzzles`);
  }

  /**
   * Warm up cache for a puzzle after invalidation.
   * In production this would pre-populate Redis with the latest data.
   */
  async warmUpCache(puzzleId: string, data: unknown): Promise<void> {
    const key = this.buildPuzzleKey(puzzleId);
    this.cache.set(key, data);
    this.logger.log(`Cache warmed up for puzzle ${puzzleId}`);
  }

  /**
   * Full invalidation: puzzle + its category + all its tags.
   */
  async fullInvalidation(options: CacheInvalidationOptions): Promise<void> {
    if (options.puzzleId) {
      await this.invalidatePuzzle(options.puzzleId);
      await this.invalidateSearchIndex(options.puzzleId);
    }
    if (options.categoryId) {
      await this.invalidateCategory(options.categoryId);
    }
    if (options.tags) {
      for (const tag of options.tags) {
        await this.invalidateByTag(tag);
      }
    }
    if (options.batch) {
      await this.invalidateBatch(options.batch);
    }
  }

  /** Expose cache size (useful for unit tests). */
  getCacheSize(): number {
    return this.cache.size;
  }
}
