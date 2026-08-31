import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity("outbox_events")
export class OutboxEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  type: string;

  @Column({ type: "jsonb" })
  payload: any;

  @Column({ default: "PENDING" })
  status: string; // "PENDING", "PROCESSED", "FAILED"

  @Column({ nullable: true })
  error?: string;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: "timestamp", nullable: true })
  processedAt?: Date;
}
