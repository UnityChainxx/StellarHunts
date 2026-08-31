import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { OutboxService } from "./outbox.service";
import { OutboxEvent } from "./entities/outbox-event.entity";

describe("OutboxService", () => {
  let service: OutboxService;

  const mockRepository: any = {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createEvent", () => {
    it("should save a new outbox event", async () => {
      const payload = { test: "data" };
      const event = new OutboxEvent();
      event.type = "TEST_EVENT";
      event.payload = payload;
      event.status = "PENDING";

      mockRepository.save.mockResolvedValue(event);

      const result = await service.createEvent("TEST_EVENT", payload);
      expect(result).toEqual(event);
    });
  });
});
