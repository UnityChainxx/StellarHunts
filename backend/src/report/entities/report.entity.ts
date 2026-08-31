import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

export enum ReportStatus {
  OPEN = 'OPEN',
  TRIAGED = 'TRIAGED',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

@Entity('report')
@Unique(['puzzleId', 'userId'])
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  puzzleId: number;

  @Column({ length: 128 })
  userId: number;

  @Column()
  message: string;

  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.OPEN,
  })
  status: ReportStatus;

  @Column({ nullable: true })
  assignedTo?: string;

  @Column({ nullable: true })
  adminNote?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
