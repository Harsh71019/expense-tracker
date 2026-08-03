"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { MonthlySpendingSchema, type MonthlySpending } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useMonthlySpending(
  initialData?: MonthlySpending | null
): UseQueryResult<MonthlySpending, Error> {
  return useQuery({
    queryKey: qk.monthlySpending(),
    ...(initialData === undefined || initialData === null ? {} : { initialData }),
    queryFn: async (): Promise<MonthlySpending> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/monthly-spending");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = MonthlySpendingSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
