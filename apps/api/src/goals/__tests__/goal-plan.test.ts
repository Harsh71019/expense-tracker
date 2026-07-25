import type { Goal } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { calculateGoalPlan } from "../goal-plan.js";

const BASE_GOAL: Goal = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Emergency Fund",
  targetMinor: 100_000,
  fundingMode: "tagged",
  tag: "goal:emergency",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 40_000,
  createdAt: new Date("2026-05-10T00:00:00.000Z"),
  updatedAt: new Date("2026-05-10T00:00:00.000Z")
};

describe("calculateGoalPlan", () => {
  it("calculates an integer required monthly contribution for a target date", () => {
    const plan = calculateGoalPlan(
      { ...BASE_GOAL, targetDate: new Date("2026-10-25T00:00:00.000Z") },
      new Date("2026-07-25T06:00:00.000Z")
    );

    expect(plan).toEqual({
      goalId: BASE_GOAL.id,
      mode: "target_date",
      requiredMonthlyMinor: 20_000,
      projectedCompletionDate: null
    });
  });

  it("rounds required monthly contributions up to the next paise", () => {
    const plan = calculateGoalPlan(
      {
        ...BASE_GOAL,
        targetMinor: 100_001,
        targetDate: new Date("2026-10-25T00:00:00.000Z")
      },
      new Date("2026-07-25T06:00:00.000Z")
    );

    expect(plan.requiredMonthlyMinor).toBe(20_001);
  });

  it("projects completion from the since-creation average contribution rate", () => {
    const plan = calculateGoalPlan(BASE_GOAL, new Date("2026-07-25T06:00:00.000Z"));

    expect(plan.mode).toBe("at_current_rate");
    expect(plan.requiredMonthlyMinor).toBeNull();
    expect(plan.projectedCompletionDate?.toISOString()).toBe("2026-10-25T00:00:00.000Z");
  });

  it("returns no projection when the average contribution rate is non-positive", () => {
    const plan = calculateGoalPlan(
      { ...BASE_GOAL, progressMinor: -1 },
      new Date("2026-07-25T06:00:00.000Z")
    );

    expect(plan.projectedCompletionDate).toBeNull();
  });

  it("projects an already-completed goal at the current instant", () => {
    const now = new Date("2026-07-25T06:00:00.000Z");
    const plan = calculateGoalPlan({ ...BASE_GOAL, progressMinor: 100_000 }, now);

    expect(plan.projectedCompletionDate).toEqual(now);
  });
});
