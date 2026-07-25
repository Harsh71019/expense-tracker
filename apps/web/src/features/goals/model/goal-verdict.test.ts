import type { Goal, GoalPlan } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { goalVerdict } from "./goal-verdict";

const goal: Goal = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Laptop",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "goal:laptop",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 25_000,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("goalVerdict", () => {
  it("shows the current-rate horizon without a target date", () => {
    const plan: GoalPlan = {
      goalId: goal.id,
      mode: "at_current_rate",
      requiredMonthlyMinor: null,
      projectedCompletionDate: new Date("2026-10-01T00:00:00.000Z")
    };

    expect(goalVerdict(goal, plan, new Date("2026-07-01T00:00:00.000Z")).label).toBe(
      "3 months at current rate"
    );
  });

  it("gives achieved goals a celebratory terminal verdict", () => {
    expect(goalVerdict({ ...goal, status: "achieved" }, undefined, new Date()).tone).toBe(
      "success"
    );
  });
});
