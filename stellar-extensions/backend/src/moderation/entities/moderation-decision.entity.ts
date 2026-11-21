import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  ModerationAction,
  ModerationStatus,
} from './moderation-queue-item.entity';

@Entity('moderation_decisions')
@Index(['queueItemId'])
@Index(['puzzleId'])
export class ModerationDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  queueItemId: string;

  @Column('uuid')
  puzzleId: string;

  @Column('uuid')
  moderatorId: string;

  @Column({ type: 'enum', enum: ModerationAction })
  action: ModerationAction;

  @Column({ type: 'enum', enum: ModerationStatus })
  fromStatus: ModerationStatus;

  @Column({ type: 'enum', enum: ModerationStatus })
  toStatus: ModerationStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** Time from submission (or assignment) to this decision, in minutes. */
  @Column({ type: 'int', nullable: true })
  reviewDurationMinutes: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
