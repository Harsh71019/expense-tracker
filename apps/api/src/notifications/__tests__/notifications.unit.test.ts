import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { NotificationDeliveryService } from "../notification-delivery.service.js";
import { NotificationRecoveryService } from "../notification-recovery.service.js";
import { NotificationSweepService } from "../notification-sweep.service.js";

describe("Notification Services Unit Tests", () => {
  const sampleNotification = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    type: "budget_alert" as const,
    payload: { title: "Alert", message: "Low balance" },
    status: "pending" as const,
    deliveryAttempts: 0,
    attemptCount: 0,
    createdAt: new Date()
  };

  describe("NotificationDeliveryService", () => {
    it("deliver sends notification and marks sent in outbox", async () => {
      const mockOutboxRepo = {
        claimForDelivery: vi.fn(async (_userId, _id, claimToken) => ({
          ...sampleNotification,
          status: "delivering",
          claimToken,
          attemptCount: 1
        })),
        markSent: vi.fn(async () => true),
        releaseFailed: vi.fn(async () => undefined)
      };
      const mockAdapter = { send: vi.fn(async () => undefined) };

      // @ts-expect-error mock service args
      const service = new NotificationDeliveryService(mockOutboxRepo, mockAdapter);
      await service.deliver("u1", sampleNotification.id);

      expect(mockAdapter.send).toHaveBeenCalledWith({
        idempotencyKey: sampleNotification.id,
        userId: "u1",
        type: "budget_alert",
        payload: { title: "Alert", message: "Low balance" }
      });
      expect(mockOutboxRepo.markSent).toHaveBeenCalledWith(
        "u1",
        sampleNotification.id,
        expect.any(String)
      );
    });

    it("persists terminal delivery exhaustion and skips dead-lettered entries", async () => {
      const mockOutboxRepo = {
        claimForDelivery: vi.fn(async () => null),
        markSent: vi.fn(async () => true),
        releaseFailed: vi.fn(async () => undefined),
        markTerminalFailure: vi.fn(async () => undefined)
      };
      const mockAdapter = { send: vi.fn(async () => undefined) };
      // @ts-expect-error focused collaborators
      const service = new NotificationDeliveryService(mockOutboxRepo, mockAdapter);

      await service.markTerminalFailure("u1", sampleNotification.id, 5);
      await service.deliver("u1", sampleNotification.id);

      expect(mockOutboxRepo.markTerminalFailure).toHaveBeenCalledWith(
        "u1",
        sampleNotification.id,
        5
      );
      expect(mockAdapter.send).not.toHaveBeenCalled();
    });

    it("keeps the lease after an acknowledgement error so recovery waits for expiry", async () => {
      const claimed = {
        ...sampleNotification,
        status: "delivering" as const,
        claimToken: "00000000-0000-4000-8000-000000000000",
        attemptCount: 1
      };
      const mockOutboxRepo = {
        claimForDelivery: vi.fn(async () => claimed),
        markSent: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
        releaseFailed: vi.fn(async () => undefined)
      };
      const mockAdapter = { send: vi.fn(async () => undefined) };
      // @ts-expect-error focused service doubles
      const service = new NotificationDeliveryService(mockOutboxRepo, mockAdapter);

      await expect(service.deliver("u1", claimed.id)).rejects.toThrow("database unavailable");

      expect(mockAdapter.send).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: claimed.id })
      );
      expect(mockOutboxRepo.releaseFailed).not.toHaveBeenCalled();
    });
  });

  describe("NotificationRecoveryService", () => {
    it("resets durable dead-letter state before replacing the terminal job", async () => {
      const outbox = {
        requeueTerminalFailure: vi.fn(async () => true),
        findById: vi.fn(async () => sampleNotification)
      };
      const queue = { replaceTerminalDelivery: vi.fn(async () => undefined) };
      // @ts-expect-error focused collaborators
      const service = new NotificationRecoveryService(outbox, queue);

      await expect(service.requeue("u1", sampleNotification.id)).resolves.toBe(true);
      expect(queue.replaceTerminalDelivery).toHaveBeenCalledWith(
        "u1",
        sampleNotification.id,
        sampleNotification.attemptCount
      );
    });

    it("does not enqueue a notification that is not dead-lettered", async () => {
      const outbox = {
        requeueTerminalFailure: vi.fn(async () => false),
        findById: vi.fn(async () => sampleNotification)
      };
      const queue = { replaceTerminalDelivery: vi.fn(async () => undefined) };
      // @ts-expect-error focused collaborators
      const service = new NotificationRecoveryService(outbox, queue);

      await expect(service.requeue("u1", sampleNotification.id)).resolves.toBe(false);
      expect(queue.replaceTerminalDelivery).not.toHaveBeenCalled();
    });
  });

  describe("NotificationSweepService", () => {
    it("sweep enqueues pending deliveries on worker role", async () => {
      const mockConfig = createMockConfig("worker");
      const mockOutboxRepo = {
        systemFindDispatchable: vi.fn(async () => [sampleNotification])
      };
      const mockQueue = { enqueueDelivery: vi.fn(async () => undefined) };
      const mockLogger = { log: vi.fn() };

      const service = new NotificationSweepService(
        mockConfig,
        // @ts-expect-error mock service args
        mockOutboxRepo,
        mockQueue,
        mockLogger
      );
      await service.sweep();

      expect(mockOutboxRepo.systemFindDispatchable).toHaveBeenCalledWith(expect.any(Date), 100);
      expect(mockQueue.enqueueDelivery).toHaveBeenCalledWith("u1", sampleNotification.id, 0);
    });

    it("does not perform system discovery in the API process", async () => {
      const mockOutboxRepo = { systemFindDispatchable: vi.fn() };
      const mockQueue = { enqueueDelivery: vi.fn() };
      const service = new NotificationSweepService(
        createMockConfig("api"),
        // @ts-expect-error focused service doubles
        mockOutboxRepo,
        mockQueue,
        { log: vi.fn() }
      );

      await service.sweep();

      expect(mockOutboxRepo.systemFindDispatchable).not.toHaveBeenCalled();
      expect(mockQueue.enqueueDelivery).not.toHaveBeenCalled();
    });
  });
});
