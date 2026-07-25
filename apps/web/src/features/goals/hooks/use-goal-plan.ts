"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { GoalPlanSchema, type GoalPlan } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useGoalPlan(
  goalId: string,
  initialData: GoalPlan | undefined
): UseQueryResult<GoalPlan, Error> {
  return useQuery({
    queryKey: qk.goalPlan(goalId),
    ...(initialData === undefined ? {} : { initialData }),
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<GoalPlan> => {
      const result = await apiClient.GET("/v1/goals/{goalId}/plan", {
        params: { path: { goalId } }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = GoalPlanSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
