import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A puzzle attempt recorded inside a tracked session. `completedAt` is set
 * when the client reports a solve; attempts without it are drop-off signals.
 */
@Entity('session_puzzle_attempts')
@Index(['sessionId', 'attemptedAt'])
@Index(['puzzleId'])
export class SessionPuzzleAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sessionId: string;

  @Column('uuid')
  puzzleId: string;

  @Column({ type: 'timestamptz' })
  attemptedAt: Date;

  /** Set when the puzzle was solved during this attempt. */
  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** True once the attempt is known to have ended without a solve. */
  @Column({ type: 'boolean', default: false })
  abandoned: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
