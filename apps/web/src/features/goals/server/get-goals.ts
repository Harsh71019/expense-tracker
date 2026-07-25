import {
  GoalPlanSchema,
  GoalSchema,
  type Goal,
  type GoalPlan,
  type GoalStatus
} from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const GoalsSchema = z.array(GoalSchema);

export const getGoals = cache(async (status: GoalStatus): Promise<Goal[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/goals", { params: { query: { status } } });
    const parsed = GoalsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});

export const getGoal = cache(async (goalId: string): Promise<Goal | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/goals/{goalId}", {
      params: { path: { goalId } }
    });
    const parsed = GoalSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

export const getGoalPlan = cache(async (goalId: string): Promise<GoalPlan | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/goals/{goalId}/plan", {
      params: { path: { goalId } }
    });
    const parsed = GoalPlanSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
