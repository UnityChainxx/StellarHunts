import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BookmarkFolder } from './bookmark-folder.entity';

@Entity('puzzle_bookmarks')
@Index(['userId', 'puzzleId'], { unique: true })
export class PuzzleBookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  puzzleId: string;

  @Column({ type: 'uuid', nullable: true })
  folderId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'boolean', default: false })
  isFavorite: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => BookmarkFolder, (folder) => folder.bookmarks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'folderId' })
  folder?: BookmarkFolder | null;
}
