import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { GoalRepository } from "../goal.repository.js";

describe("GoalRepository Unit Tests", () => {
  const sampleGoalRow = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "u1",
    name: "Emergency Fund",
    targetMinor: 500000,
    status: "active",
    fundingMode: "tagged",
    tag: "car",
    targetDate: new Date("2026-12-31"),
    startedMinor: 0,
    priority: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it("create inserts goal", async () => {
    const mockDb = createMockDrizzleDb([sampleGoalRow]);
    const repo = new GoalRepository(mockDb);

    const res = await repo.create(
      "u1",
      {
        name: "Emergency Fund",
        targetMinor: 500000,
        fundingMode: "tagged",
        tag: "car",
        targetDate: new Date("2026-12-31")
      },
      0,
      1,
      // @ts-expect-error mock tx
      mockDb
    );
    expect(res.name).toBe("Emergency Fund");
  });

  it("nextPriority computes highest priority + 1", async () => {
    const mockDb = createMockDrizzleDb([{ highest: 2 }]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    const priority = await repo.nextPriority("u1", mockDb);
    expect(priority).toBe(3);
  });

  it("lockOrdering executes advisory lock SQL", async () => {
    const mockDb = createMockDrizzleDb([]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    await repo.lockOrdering("u1", mockDb);
    expect(mockDb.execute).toHaveBeenCalled();
  });

  it("list returns active goals", async () => {
    const mockDb = createMockDrizzleDb([sampleGoalRow]);
    const repo = new GoalRepository(mockDb);

    const res = await repo.list("u1", "active");
    expect(res).toHaveLength(1);
  });

  it("findById returns goal or null", async () => {
    const mockDb = createMockDrizzleDb([sampleGoalRow]);
    const repo = new GoalRepository(mockDb);

    const res = await repo.findById("u1", sampleGoalRow.id);
    expect(res?.id).toBe(sampleGoalRow.id);
  });

  it("update returns updated goal", async () => {
    const mockDb = createMockDrizzleDb([sampleGoalRow]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.update("u1", sampleGoalRow.id, { name: "New Name" }, mockDb);
    expect(res?.name).toBe("Emergency Fund");
  });

  it("abandon returns true on single update", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleGoalRow.id }]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.abandon("u1", sampleGoalRow.id, mockDb);
    expect(res).toBe(true);
  });

  it("setPriority returns true on single update", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleGoalRow.id }]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.setPriority("u1", sampleGoalRow.id, 2, mockDb);
    expect(res).toBe(true);
  });

  it("sumTaggedContributions returns summed minor amount", async () => {
    const mockDb = createMockDrizzleDb([{ total: "50000" }]);
    const repo = new GoalRepository(mockDb);

    const res = await repo.sumTaggedContributions("u1", "car");
    expect(res).toBe(50000);
  });

  it("findAllActive returns all active goals across users", async () => {
    const mockDb = createMockDrizzleDb([sampleGoalRow]);
    const repo = new GoalRepository(mockDb);

    const res = await repo.findAllActive();
    expect(res).toHaveLength(1);
  });

  it("markAchieved updates goal status to achieved", async () => {
    const mockDb = createMockDrizzleDb([{ id: sampleGoalRow.id }]);
    const repo = new GoalRepository(mockDb);

    // @ts-expect-error mock tx
    const res = await repo.markAchieved("u1", sampleGoalRow.id, mockDb);
    expect(res).toBe(true);
  });
});
