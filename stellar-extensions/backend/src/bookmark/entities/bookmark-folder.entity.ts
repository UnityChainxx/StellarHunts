import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PuzzleBookmark } from './puzzle-bookmark.entity';

@Entity('bookmark_folders')
@Index(['userId', 'name'], { unique: true })
export class BookmarkFolder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  /**
   * Unguessable token used in the public share link. Null until the owner
   * explicitly shares the folder, and cleared again when sharing is revoked.
   */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  shareSlug: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PuzzleBookmark, (bookmark) => bookmark.folder)
  bookmarks: PuzzleBookmark[];
}
