import { describe, expect, it, vi } from "vitest";

import { createMockConfig } from "../../test/mock-config.js";
import { NotificationDeliveryService } from "../notification-delivery.service.js";
import { NotificationSweepService } from "../notification-sweep.service.js";

describe("Notification Services Unit Tests", () => {
  const sampleNotification = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    type: "budget_alert" as const,
    payload: { title: "Alert", message: "Low balance" },
    status: "pending" as const,
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
