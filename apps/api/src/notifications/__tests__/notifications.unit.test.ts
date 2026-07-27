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
    createdAt: new Date()
  };

  describe("NotificationDeliveryService", () => {
    it("deliver sends notification and marks sent in outbox", async () => {
      const mockOutboxRepo = {
        findById: vi.fn(async () => sampleNotification),
        markSent: vi.fn(async () => undefined)
      };
      const mockAdapter = { send: vi.fn(async () => undefined) };

      // @ts-expect-error mock service args
      const service = new NotificationDeliveryService(mockOutboxRepo, mockAdapter);
      await service.deliver("u1", "123e4567-e89b-12d3-a456-426614174000");

      expect(mockAdapter.send).toHaveBeenCalledWith({
        userId: "u1",
        type: "budget_alert",
        payload: { title: "Alert", message: "Low balance" }
      });
      expect(mockOutboxRepo.markSent).toHaveBeenCalledWith(
        "u1",
        "123e4567-e89b-12d3-a456-426614174000"
      );
    });

    it("persists terminal delivery exhaustion and skips dead-lettered entries", async () => {
      const mockOutboxRepo = {
        findById: vi.fn(async () => ({
          ...sampleNotification,
          failureCode: "delivery_retries_exhausted" as const,
          failedAt: new Date(),
          deliveryAttempts: 5
        })),
        markSent: vi.fn(async () => undefined),
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
  });

  describe("NotificationRecoveryService", () => {
    it("resets durable dead-letter state before replacing the terminal job", async () => {
      const outbox = { requeueTerminalFailure: vi.fn(async () => true) };
      const queue = { replaceTerminalDelivery: vi.fn(async () => undefined) };
      // @ts-expect-error focused collaborators
      const service = new NotificationRecoveryService(outbox, queue);

      await expect(service.requeue("u1", sampleNotification.id)).resolves.toBe(true);
      expect(queue.replaceTerminalDelivery).toHaveBeenCalledWith("u1", sampleNotification.id);
    });

    it("does not enqueue a notification that is not dead-lettered", async () => {
      const outbox = { requeueTerminalFailure: vi.fn(async () => false) };
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
        systemFindPending: vi.fn(async () => [sampleNotification])
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

      expect(mockOutboxRepo.systemFindPending).toHaveBeenCalledWith(100);
      expect(mockQueue.enqueueDelivery).toHaveBeenCalledWith(
        "u1",
        "123e4567-e89b-12d3-a456-426614174000"
      );
    });
  });
});
