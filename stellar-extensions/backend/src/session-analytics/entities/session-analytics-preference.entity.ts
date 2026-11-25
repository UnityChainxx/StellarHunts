import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Per-user analytics preference. When `optedOut` is true the session
 * analytics module refuses to persist session/page/puzzle events for that
 * user — privacy opt-out support required by the analytics spec.
 */
@Entity('session_analytics_preferences')
@Index(['userId'], { unique: true })
export class SessionAnalyticsPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 128 })
  userId: string;

  @Column({ type: 'boolean', default: false })
  optedOut: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  optedOutAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
