"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { DashboardInvestmentsSchema, type DashboardInvestments } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useInvestments(
  initialData?: DashboardInvestments
): UseQueryResult<DashboardInvestments, Error> {
  return useQuery({
    queryKey: qk.investments(),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<DashboardInvestments> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/investments");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = DashboardInvestmentsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
