import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { OutboxService } from "./outbox.service";
import { OutboxEvent, OutboxStatus } from "./entities/outbox-event.entity";

describe("OutboxService", () => {
  let service: OutboxService;

  const mockRepository: any = {
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
    it("should save a new outbox event with PENDING status and 0 attempts", async () => {
      const payload = { test: "data" };
      const event = new OutboxEvent();
      event.type = "TEST_EVENT";
      event.payload = payload;
      event.status = OutboxStatus.PENDING;
      event.attempts = 0;

      mockRepository.save.mockResolvedValue(event);

      const result = await service.createEvent("TEST_EVENT", payload);
      expect(result).toEqual(event);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "TEST_EVENT",
          payload,
          status: OutboxStatus.PENDING,
          attempts: 0,
        }),
      );
    });
  });

  describe("processOutbox dispatch and error handling (issue #489)", () => {
    it("dispatches to a registered handler and marks event as PROCESSED on success", async () => {
      const event = new OutboxEvent();
      event.id = "ev-1";
      event.type = "NOTIFICATION_SEND";
      event.payload = { userId: "user-1", message: "Hello" };
      event.status = OutboxStatus.PENDING;
      event.attempts = 0;

      const handler = jest.fn<any>().mockResolvedValue(undefined);
      service.registerHandler("NOTIFICATION_SEND", handler);

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.findOne.mockResolvedValue(event);
      mockRepository.save.mockImplementation(async (e: any) => e);

      await service.processOutbox();

      expect(handler).toHaveBeenCalledWith(event.payload, event);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev-1",
          status: OutboxStatus.PROCESSED,
        }),
      );
    });

    it("records unknown event type as FAILED rather than marking processed", async () => {
      const event = new OutboxEvent();
      event.id = "ev-unknown";
      event.type = "UNKNOWN_TYPE";
      event.payload = {};
      event.status = OutboxStatus.PENDING;
      event.attempts = 0;

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.findOne.mockResolvedValue(event);
      mockRepository.save.mockImplementation(async (e: any) => e);

      await service.processOutbox();

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev-unknown",
          status: OutboxStatus.FAILED,
          attempts: 1,
          error: 'No handler registered for event type "UNKNOWN_TYPE"',
        }),
      );
    });

    it("records attempt count and next-attempt timestamp with backoff on failure", async () => {
      const event = new OutboxEvent();
      event.id = "ev-transient";
      event.type = "ONCHAIN_MINT";
      event.payload = { txId: "tx-123" };
      event.status = OutboxStatus.PENDING;
      event.attempts = 0;

      service.setBaseBackoffMs(2000);
      service.setMaxAttempts(3);

      const handler = jest.fn<any>().mockRejectedValue(new Error("RPC network timeout"));
      service.registerHandler("ONCHAIN_MINT", handler);

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.findOne.mockResolvedValue(event);
      mockRepository.save.mockImplementation(async (e: any) => e);

      const before = Date.now();
      await service.processOutbox();

      expect(handler).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev-transient",
          status: OutboxStatus.FAILED,
          attempts: 1,
          error: "RPC network timeout",
        }),
      );

      const savedCall = mockRepository.save.mock.calls.find((call: any[]) =>
        call[0].status === OutboxStatus.FAILED,
      );
      expect(savedCall).toBeDefined();
      const savedEvent = savedCall[0];
      expect(savedEvent.nextAttemptAt).toBeDefined();
      // Backoff delay for attempt 1: 2000 * 2^0 = 2000ms
      expect(savedEvent.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 1900);
    });

    it("parks event in DEAD_LETTER state once max attempts are reached", async () => {
      const event = new OutboxEvent();
      event.id = "ev-poison";
      event.type = "CRITICAL_PAYMENT";
      event.payload = {};
      event.status = OutboxStatus.FAILED;
      event.attempts = 2; // Last attempt before max (3)

      service.setMaxAttempts(3);

      const handler = jest.fn<any>().mockRejectedValue(new Error("Permanent rejection"));
      service.registerHandler("CRITICAL_PAYMENT", handler);

      mockRepository.find.mockResolvedValue([event]);
      mockRepository.findOne.mockResolvedValue(event);
      mockRepository.save.mockImplementation(async (e: any) => e);

      await service.processOutbox();

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "ev-poison",
          status: OutboxStatus.DEAD_LETTER,
          attempts: 3,
          error: "Permanent rejection",
          nextAttemptAt: undefined,
        }),
      );
    });

    it("bounds getPendingEvents per tick", async () => {
      service.setBatchSize(10);
      mockRepository.find.mockResolvedValue([]);

      await service.getPendingEvents();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    it("skips event if another concurrent processor already claimed it", async () => {
      const event = new OutboxEvent();
      event.id = "ev-concurrent";
      event.type = "SHARED_TASK";
      event.payload = {};
      event.status = OutboxStatus.PENDING;

      const handler = jest.fn();
      service.registerHandler("SHARED_TASK", handler);

      mockRepository.find.mockResolvedValue([event]);
      // Mock claimEvent to fail (e.g. status already changed to PROCESSING by another worker)
      jest.spyOn(service, "claimEvent").mockResolvedValue(false);

      await service.processOutbox();

      expect(handler).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
});
