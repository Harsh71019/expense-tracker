"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  RecurringForecastSchema,
  type RecurringForecast,
  type DashboardRange
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useRecurringForecast(
  range: DashboardRange,
  initialData?: RecurringForecast
): UseQueryResult<RecurringForecast, Error> {
  return useQuery({
    queryKey: qk.recurringForecast(range),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<RecurringForecast> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/recurring-forecast", {
          params: { query: { range } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecurringForecastSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
