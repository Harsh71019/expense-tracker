"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { DashboardStatsSchema, type DashboardStats } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useStats(
  initialData?: DashboardStats | null
): UseQueryResult<DashboardStats, Error> {
  return useQuery({
    queryKey: qk.dashboardStats(),
    ...(initialData === undefined || initialData === null ? {} : { initialData }),
    queryFn: async (): Promise<DashboardStats> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/stats");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = DashboardStatsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
