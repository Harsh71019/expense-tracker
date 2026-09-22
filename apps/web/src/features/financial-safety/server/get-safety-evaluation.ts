import "server-only";

import { SafetyEvaluationSchema, type SafetyEvaluation } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

/**
 * Initial authenticated server-side render fetcher for the Safety
 * Evaluation. A transport failure or schema mismatch fails closed to
 * `null` -- the dashboard renders its own unavailable state rather than
 * crashing the page.
 */
export const getSafetyEvaluation = cache(
  async (asOf?: string): Promise<SafetyEvaluation | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/financial-safety/evaluation", {
        params: { query: asOf ? { asOf } : {} }
      });
      const parsed = SafetyEvaluationSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
