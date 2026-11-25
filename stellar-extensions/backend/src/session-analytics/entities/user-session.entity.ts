import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A single user browsing/playing session tracked for product analytics.
 *
 * Sessions are created client-side (page load) and closed explicitly or by
 * inactivity. `endedAt`/`durationSeconds` stay null while the session is live.
 */
@Entity('user_sessions')
@Index(['userId', 'startedAt'])
@Index(['sessionKey'], { unique: true })
export class UserSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Owner of the session (account id, wallet address or anonymous id). */
  @Column({ length: 128, nullable: true })
  @Index()
  userId: string | null;

  /**
   * Client-generated correlation id so the frontend can re-attach events to
   * the same session across retries without creating duplicates.
   */
  @Column({ length: 128, nullable: true })
  sessionKey: string | null;

  /** Free-form context (device class, referrer, entry page, ...). */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  /** Wall-clock session length in seconds, computed when the session ends. */
  @Column({ type: 'int', nullable: true })
  durationSeconds: number | null;

  /** Entry page recorded at session start, when supplied by the client. */
  @Column({ length: 512, nullable: true })
  entryPage: string | null;

  /** Page where the session ended (denormalized drop-off hint). */
  @Column({ length: 512, nullable: true })
  exitPage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
