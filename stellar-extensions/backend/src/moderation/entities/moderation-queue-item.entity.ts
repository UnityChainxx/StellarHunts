import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ModerationStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in-review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CHANGES_REQUESTED = 'changes-requested',
}

export enum ModerationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ModerationAction {
  APPROVE = 'approve',
  REJECT = 'reject',
  REQUEST_CHANGES = 'request-changes',
}

/** Higher number = reviewed sooner. */
export const PRIORITY_WEIGHT: Record<ModerationPriority, number> = {
  [ModerationPriority.LOW]: 0,
  [ModerationPriority.NORMAL]: 1,
  [ModerationPriority.HIGH]: 2,
  [ModerationPriority.URGENT]: 3,
};

/** Hours a submission may wait before breaching its review SLA. */
export const SLA_HOURS: Record<ModerationPriority, number> = {
  [ModerationPriority.LOW]: 72,
  [ModerationPriority.NORMAL]: 24,
  [ModerationPriority.HIGH]: 12,
  [ModerationPriority.URGENT]: 4,
};

@Entity('moderation_queue_items')
@Index(['puzzleId'], { unique: true })
export class ModerationQueueItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  puzzleId: string;

  @Column('uuid')
  submittedBy: string;

  @Column({ length: 200 })
  title: string;

  @Column('text')
  description: string;

  @Column({
    type: 'enum',
    enum: ModerationStatus,
    default: ModerationStatus.PENDING,
  })
  status: ModerationStatus;

  @Column({
    type: 'enum',
    enum: ModerationPriority,
    default: ModerationPriority.NORMAL,
  })
  priority: ModerationPriority;

  /** Highest automated risk score (0–1) across the checks. */
  @Column({ type: 'float', default: 0 })
  automatedRiskScore: number;

  @Column({ type: 'uuid', nullable: true })
  assignedModeratorId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  /** Deadline derived from the priority when the puzzle enters the queue. */
  @Column({ type: 'timestamptz' })
  slaDeadline: Date;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  decisionReason: string | null;

  /** Minutes between submission and the moderator's decision. */
  @Column({ type: 'int', nullable: true })
  reviewDurationMinutes: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
