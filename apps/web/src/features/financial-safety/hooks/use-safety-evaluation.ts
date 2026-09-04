"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { SafetyEvaluationSchema, type SafetyEvaluation } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useSafetyEvaluation(
  initialData: SafetyEvaluation | null,
  asOf?: string
): UseQueryResult<SafetyEvaluation | null, Error> {
  return useQuery({
    queryKey: qk.safetyEvaluation(asOf),
    initialData,
    queryFn: async (): Promise<SafetyEvaluation | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-safety/evaluation", {
          params: { query: asOf ? { asOf } : {} }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = SafetyEvaluationSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
