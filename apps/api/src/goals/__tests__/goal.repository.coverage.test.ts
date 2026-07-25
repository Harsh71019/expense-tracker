import { describe, expect, it } from "vitest";

import { createMockDrizzleDb } from "../../test/mock-drizzle.js";
import { GoalRepository } from "../goal.repository.js";

const GOAL_ID = "123e4567-e89b-42d3-a456-426614174000";
const ACCOUNT_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const ROW = {
  id: GOAL_ID,
  userId: "u1",
  name: "House",
  targetMinor: 100_000,
  targetDate: null,
  fundingMode: "linked_account",
  linkedAccountId: ACCOUNT_ID,
  tag: null,
  priority: 0,
  status: "active",
  startedMinor: 10_000,
  createdAt: NOW,
  updatedAt: NOW
};

describe("GoalRepository edge coverage", () => {
  it("creates a linked-account goal without a target date and rejects missing inserts", async () => {
    const found = createMockDrizzleDb([ROW]);
    await expect(
      new GoalRepository(found).create(
        "u1",
        {
          name: "House",
          targetMinor: 100_000,
          fundingMode: "linked_account",
          linkedAccountId: ACCOUNT_ID
        },
        10_000,
        0,
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ fundingMode: "linked_account", linkedAccountId: ACCOUNT_ID });

    const missing = createMockDrizzleDb();
    await expect(
      new GoalRepository(missing).create(
        "u1",
        {
          name: "House",
          targetMinor: 100_000,
          fundingMode: "linked_account",
          linkedAccountId: ACCOUNT_ID
        },
        0,
        0,
        // @ts-expect-error - fluent transaction double.
        missing
      )
    ).rejects.toThrow("Goal insert did not return a row.");
  });

  it("starts priority at zero for absent and null aggregates", async () => {
    for (const rows of [[], [{ highest: null }]]) {
      const db = createMockDrizzleDb(rows);
      await expect(
        new GoalRepository(db).nextPriority(
          "u1",
          // @ts-expect-error - fluent transaction double.
          db
        )
      ).resolves.toBe(0);
    }
  });

  it("uses explicit transaction executors and returns missing rows as null", async () => {
    const found = createMockDrizzleDb([ROW]);
    const repository = new GoalRepository(found);
    await expect(
      repository.list(
        "u1",
        "active",
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toHaveLength(1);
    await expect(
      repository.findById(
        "u1",
        GOAL_ID,
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ id: GOAL_ID });
    await expect(
      new GoalRepository(createMockDrizzleDb()).findById("u1", GOAL_ID)
    ).resolves.toBeNull();
  });

  it("updates every optional field and handles a lost update", async () => {
    const updated = {
      ...ROW,
      name: "Updated",
      targetMinor: 200_000,
      targetDate: NOW
    };
    const found = createMockDrizzleDb([updated]);
    await expect(
      new GoalRepository(found).update(
        "u1",
        GOAL_ID,
        { name: "Updated", targetMinor: 200_000, targetDate: NOW },
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toMatchObject({ name: "Updated", targetMinor: 200_000 });

    const missing = createMockDrizzleDb();
    await expect(
      new GoalRepository(missing).update(
        "u1",
        GOAL_ID,
        { targetDate: null },
        // @ts-expect-error - fluent transaction double.
        missing
      )
    ).resolves.toBeNull();
  });

  it("returns false for unsuccessful conditional status and priority updates", async () => {
    const db = createMockDrizzleDb();
    const repository = new GoalRepository(db);
    await expect(
      repository.abandon(
        "u1",
        GOAL_ID,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBe(false);
    await expect(
      repository.setPriority(
        "u1",
        GOAL_ID,
        1,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBe(false);
    await expect(
      repository.markAchieved(
        "u1",
        GOAL_ID,
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toBe(false);
  });

  it("uses an explicit transaction and zero fallback for contribution sums", async () => {
    const found = createMockDrizzleDb([{ total: null }]);
    await expect(
      new GoalRepository(found).sumTaggedContributions(
        "u1",
        "house",
        // @ts-expect-error - fluent transaction double.
        found
      )
    ).resolves.toBe(0);
    await expect(
      new GoalRepository(createMockDrizzleDb()).sumTaggedContributions("u1", "house")
    ).resolves.toBe(0);
  });
});
