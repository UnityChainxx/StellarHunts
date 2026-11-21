import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ModerationCheckType = 'profanity' | 'spam';

@Entity('moderation_check_logs')
@Index(['puzzleId'])
export class ModerationCheckLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  queueItemId: string;

  /** Denormalized so checks can be looked up by puzzle directly. */
  @Column('uuid')
  puzzleId: string;

  @Column({ type: 'varchar', length: 32 })
  checkType: ModerationCheckType;

  @Column({ type: 'boolean' })
  passed: boolean;

  /** Risk score between 0 (clean) and 1 (very likely abusive). */
  @Column({ type: 'float', default: 0 })
  score: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  findings: string[];

  @CreateDateColumn()
  createdAt: Date;
}
