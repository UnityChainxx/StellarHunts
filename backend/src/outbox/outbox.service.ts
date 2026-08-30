import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./entities/outbox-event.entity";
import { Cron, CronExpression } from "@nestjs/schedule";

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
  ) {}

  async createEvent(type: string, payload: any, manager?: EntityManager): Promise<OutboxEvent> {
    const event = new OutboxEvent();
    event.type = type;
    event.payload = payload;
    event.status = "PENDING";

    if (manager) {
      return manager.save(event);
    }
    return this.outboxRepository.save(event);
  }

  async getPendingEvents(): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: { status: "PENDING" },
      order: { createdAt: "ASC" },
    });
  }

  async markAsProcessed(id: string): Promise<OutboxEvent> {
    const event = await this.outboxRepository.findOne({ where: { id } });
    if (!event) {
      throw new Error(`Outbox event with ID ${id} not found`);
    }
    event.status = "PROCESSED";
    event.processedAt = new Date();
    return this.outboxRepository.save(event);
  }

  async markAsFailed(id: string, error: string): Promise<OutboxEvent> {
    const event = await this.outboxRepository.findOne({ where: { id } });
    if (!event) {
      throw new Error(`Outbox event with ID ${id} not found`);
    }
    event.status = "FAILED";
    event.error = error;
    event.processedAt = new Date();
    return this.outboxRepository.save(event);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutbox() {
    const events = await this.getPendingEvents();
    for (const event of events) {
      try {
        console.log(`Processing outbox event: ${event.type}`, event.payload);
        await this.markAsProcessed(event.id);
      } catch (err) {
        await this.markAsFailed(event.id, err.message);
      }
    }
  }
}
