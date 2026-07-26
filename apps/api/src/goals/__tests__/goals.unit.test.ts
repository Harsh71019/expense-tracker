import { describe, expect, it, vi } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { GoalMutationService } from "../goal-mutation.service.js";
import { GoalService } from "../goal.service.js";

describe("GoalService Unit Tests", () => {
  const sampleGoal = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "New Car",
    targetMinor: 500000,
    status: "active" as const,
    fundingMode: "tagged" as const,
    tag: "car",
    targetDate: new Date("2026-12-31"),
    startedMinor: 0,
    priority: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe("GoalService", () => {
    it("createInTx computes next priority and inserts goal", async () => {
      const mockDb = createMockDrizzleDb([sampleGoal]);
      const mockRepo = {
        list: vi.fn(async () => []),
        sumTaggedContributions: vi.fn(async () => 50000),
        create: vi.fn(async () => sampleGoal),
        nextPriority: vi.fn(async () => 1)
      };
      const mockAccounts = { findById: vi.fn(async () => null) };
      const mockAudit = { record: vi.fn(async () => undefined) };

      // @ts-expect-error mock service args
      const service = new GoalService(mockDb, mockRepo, mockAccounts, mockAudit);

      const res = await service.createInTx(
        "u1",
        { name: "New Car", targetMinor: 500000, fundingMode: "tagged", tag: "car" },
        // @ts-expect-error mock tx
        "tx1"
      );

      expect(res.name).toBe("New Car");
    });

    it("getProgress returns startedMinor plus tagged contributions for tagged goals", async () => {
      const mockDb = createMockDrizzleDb([sampleGoal]);
      const mockRepo = {
        sumTaggedContributions: vi.fn(async () => 150000)
      };
      const mockAccounts = { findById: vi.fn(async () => null) };
      const mockAudit = { record: vi.fn(async () => undefined) };

      // @ts-expect-error mock service args
      const service = new GoalService(mockDb, mockRepo, mockAccounts, mockAudit);

      const progress = await service.getProgress("u1", sampleGoal);
      expect(progress).toBe(150000);
    });
  });

  describe("GoalMutationService", () => {
    it("delegates create to GoalService", async () => {
      const mockGoalService = { createInTx: vi.fn(async () => sampleGoal) };
      const mockIdempotency = {
        execute: vi.fn(async (_u, _op, _k, _s, work) => {
          const res = await work("tx1");
          return { result: res, replayed: false };
        })
      };

      // @ts-expect-error mock service args
      const mutationService = new GoalMutationService(mockGoalService, mockIdempotency);

      const res = await mutationService.create(
        "u1",
        {
          name: "New Car",
          targetMinor: 500000,
          fundingMode: "tagged",
          tag: "car"
        },
        "key1"
      );

      expect(res.result.name).toBe("New Car");
    });
  });
});
