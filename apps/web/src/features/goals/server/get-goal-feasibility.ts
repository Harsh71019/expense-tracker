import { GoalFeasibilityReportSchema, type GoalFeasibilityReport } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getGoalFeasibility = cache(
  async (asOf?: Date): Promise<GoalFeasibilityReport | null> => {
    try {
      const client = await getServerApiClient();
      const result = asOf
        ? await client.GET("/v1/goals/feasibility", {
            params: { query: { asOf: asOf.toISOString() } }
          })
        : await client.GET("/v1/goals/feasibility");
      const parsed = GoalFeasibilityReportSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
