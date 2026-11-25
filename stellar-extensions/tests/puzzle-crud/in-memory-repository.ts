/**
 * In-memory TypeORM repository stand-in for the puzzle CRUD integration
 * tests. Extends the shared referral-suite repository with the extra
 * surface the puzzle services need (`findOneBy`, `remove`, `delete`,
 * `count(where)`).
 */

import { InMemoryRepository as BaseRepository } from "../referral/support/in-memory-repository";

export class InMemoryRepository<T extends Record<string, any>> extends BaseRepository<T> {
  /**
   * TypeORM applies `order` before picking the first row; the shared base
   * `findOne` ignores it, so honour ordering here (needed by
   * `PuzzleForkService.findSourcePuzzle`'s latest-version lookup).
   */
  async findOne(options: any = {}): Promise<T | null> {
    const rows = await this.find(options);
    return rows[0] ?? null;
  }

  async findOneBy(where: Partial<Record<keyof T, unknown>>): Promise<T | null> {
    return this.findOne({ where });
  }

  async remove(entity: T): Promise<T> {
    const index = this.rows.findIndex((row) => row.id === (entity as any).id);
    if (index !== -1) this.rows.splice(index, 1);
    return { ...entity };
  }

  async delete(
    criteria: string | Partial<Record<keyof T, unknown>>,
  ): Promise<{ affected: number }> {
    const before = this.rows.length;
    if (typeof criteria === "string") {
      const index = this.rows.findIndex((row) => (row as any).id === criteria);
      if (index !== -1) this.rows.splice(index, 1);
    } else {
      for (let i = this.rows.length - 1; i >= 0; i--) {
        const row = this.rows[i];
        const matches = Object.entries(criteria).every(
          ([field, value]) => (row as any)[field] === value,
        );
        if (matches) this.rows.splice(i, 1);
      }
    }
    return { affected: before - this.rows.length };
  }

  async count(options?: { where?: Partial<Record<keyof T, unknown>> }): Promise<number> {
    if (!options?.where) return this.rows.length;
    return (await this.find(options)).length;
  }
}
