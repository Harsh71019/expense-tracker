"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RecurringStatsSchema, type RecurringStats } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useRecurringStats(
  initialData: RecurringStats | null
): UseQueryResult<RecurringStats, Error> {
  return useQuery({
    queryKey: qk.recurringStats(),
    ...(initialData === null ? {} : { initialData }),
    queryFn: async (): Promise<RecurringStats> => {
      try {
        const result = await apiClient.GET("/v1/recurring/stats");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringStatsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
