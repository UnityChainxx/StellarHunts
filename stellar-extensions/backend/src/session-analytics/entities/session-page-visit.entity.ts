import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One page view inside a tracked session. Ordered by `visitedAt`; the last
 * row for a session is its drop-off page candidate.
 */
@Entity('session_page_visits')
@Index(['sessionId', 'visitedAt'])
export class SessionPageVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sessionId: string;

  /** Route/path visited, e.g. `/puzzles/abc`. */
  @Column({ length: 512 })
  path: string;

  @Column({ length: 255, nullable: true })
  title: string | null;

  /**
   * Client-measured time spent on the page in milliseconds. Null when the
   * client only reported the navigation.
   */
  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: 'timestamptz' })
  visitedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
