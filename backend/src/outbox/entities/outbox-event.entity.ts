import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

export enum OutboxStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
  DEAD_LETTER = "DEAD_LETTER",
}

@Entity("outbox_events")
export class OutboxEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  type: string;

  @Column({ type: "jsonb" })
  payload: any;

  @Column({ default: OutboxStatus.PENDING })
  status: string; // "PENDING", "PROCESSING", "PROCESSED", "FAILED", "DEAD_LETTER"

  @Column({ nullable: true })
  error?: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: "timestamp", nullable: true })
  nextAttemptAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "timestamp", nullable: true })
  processedAt?: Date;
}
