"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { MonthlyRollupSchema, type MonthlyRollup } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useMonthlyRollup(
  month: string,
  initialData?: MonthlyRollup | null
): UseQueryResult<MonthlyRollup | null, Error> {
  return useQuery({
    queryKey: qk.monthlyRollup(month),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<MonthlyRollup | null> => {
      try {
        const result = await apiClient.GET("/v1/reports/monthly/{month}", {
          params: { path: { month } }
        });
        if (result.response.status === 404) return null;
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = MonthlyRollupSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
