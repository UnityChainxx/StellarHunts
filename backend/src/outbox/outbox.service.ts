import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager, LessThanOrEqual } from "typeorm";
import { OutboxEvent, OutboxStatus } from "./entities/outbox-event.entity";
import { Cron, CronExpression } from "@nestjs/schedule";

export type OutboxEventHandler = (payload: any, event: OutboxEvent) => Promise<void> | void;

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_BACKOFF_MS = 1000;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, OutboxEventHandler>();
  private isProcessing = false;

  private maxAttempts = DEFAULT_MAX_ATTEMPTS;
  private baseBackoffMs = DEFAULT_BASE_BACKOFF_MS;
  private batchSize = DEFAULT_BATCH_SIZE;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
  ) {}

  registerHandler(type: string, handler: OutboxEventHandler): void {
    this.handlers.set(type, handler);
  }

  getHandler(type: string): OutboxEventHandler | undefined {
    return this.handlers.get(type);
  }

  setMaxAttempts(max: number): void {
    this.maxAttempts = max;
  }

  setBaseBackoffMs(ms: number): void {
    this.baseBackoffMs = ms;
  }

  setBatchSize(size: number): void {
    this.batchSize = size;
  }

  async createEvent(type: string, payload: any, manager?: EntityManager): Promise<OutboxEvent> {
    const event = new OutboxEvent();
    event.type = type;
    event.payload = payload;
    event.status = OutboxStatus.PENDING;
    event.attempts = 0;

    if (manager) {
      return manager.save(event);
    }
    return this.outboxRepository.save(event);
  }

  async getPendingEvents(limit = this.batchSize): Promise<OutboxEvent[]> {
    const now = new Date();
    if (this.outboxRepository.createQueryBuilder) {
      return this.outboxRepository
        .createQueryBuilder("event")
        .where("event.status = :pending", { pending: OutboxStatus.PENDING })
        .orWhere(
          "(event.status = :failed AND (event.nextAttemptAt IS NULL OR event.nextAttemptAt <= :now))",
          {
            failed: OutboxStatus.FAILED,
            now,
          },
        )
        .orderBy("event.createdAt", "ASC")
        .take(limit)
        .getMany();
    }
    return this.outboxRepository.find({
      where: [
        { status: OutboxStatus.PENDING },
        { status: OutboxStatus.FAILED, nextAttemptAt: LessThanOrEqual(now) },
      ],
      order: { createdAt: "ASC" },
      take: limit,
    });
  }

  async claimEvent(id: string): Promise<boolean> {
    if (this.outboxRepository.createQueryBuilder) {
      const result = await this.outboxRepository
        .createQueryBuilder()
        .update(OutboxEvent)
        .set({ status: OutboxStatus.PROCESSING })
        .where("id = :id AND status IN (:...statuses)", {
          id,
          statuses: [OutboxStatus.PENDING, OutboxStatus.FAILED],
        })
        .execute();
      return (result?.affected ?? 0) > 0;
    }
    const event = await this.outboxRepository.findOne({ where: { id } });
    if (!event || (event.status !== OutboxStatus.PENDING && event.status !== OutboxStatus.FAILED)) {
      return false;
    }
    event.status = OutboxStatus.PROCESSING;
    await this.outboxRepository.save(event);
    return true;
  }

  async markAsProcessed(id: string): Promise<OutboxEvent> {
    const event = await this.outboxRepository.findOne({ where: { id } });
    if (!event) {
      throw new Error(`Outbox event with ID ${id} not found`);
    }
    event.status = OutboxStatus.PROCESSED;
    event.processedAt = new Date();
    return this.outboxRepository.save(event);
  }

  async markAsFailed(id: string, error: string): Promise<OutboxEvent> {
    const event = await this.outboxRepository.findOne({ where: { id } });
    if (!event) {
      throw new Error(`Outbox event with ID ${id} not found`);
    }
    return this.handleFailure(event, new Error(error));
  }

  async handleFailure(event: OutboxEvent, error: Error): Promise<OutboxEvent> {
    event.attempts = (event.attempts || 0) + 1;
    event.error = error.message;
    event.processedAt = new Date();

    if (event.attempts >= this.maxAttempts) {
      event.status = OutboxStatus.DEAD_LETTER;
      event.nextAttemptAt = undefined;
      this.logger.error(
        `Outbox event ${event.id} (type: ${event.type}) reached max attempts (${this.maxAttempts}). Moved to DEAD_LETTER. Error: ${error.message}`,
      );
    } else {
      event.status = OutboxStatus.FAILED;
      const delay = this.baseBackoffMs * Math.pow(2, event.attempts - 1);
      event.nextAttemptAt = new Date(Date.now() + delay);
      this.logger.warn(
        `Outbox event ${event.id} (type: ${event.type}) attempt ${event.attempts} failed: ${error.message}. Retrying at ${event.nextAttemptAt.toISOString()}`,
      );
    }

    return this.outboxRepository.save(event);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug("Outbox processing tick skipped: previous run still in progress");
      return;
    }

    this.isProcessing = true;
    try {
      const events = await this.getPendingEvents(this.batchSize);
      for (const event of events) {
        const claimed = await this.claimEvent(event.id);
        if (!claimed) {
          continue;
        }

        const handler = this.handlers.get(event.type);
        if (!handler) {
          await this.handleFailure(
            event,
            new Error(`No handler registered for event type "${event.type}"`),
          );
          continue;
        }

        try {
          this.logger.log(`Processing outbox event ${event.id}: ${event.type}`);
          await handler(event.payload, event);
          await this.markAsProcessed(event.id);
        } catch (err: any) {
          await this.handleFailure(event, err);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
