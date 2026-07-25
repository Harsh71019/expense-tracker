"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { SpendMixSchema, type SpendMix, type DashboardRange } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useSpendMix(
  range: DashboardRange,
  initialData?: SpendMix
): UseQueryResult<SpendMix, Error> {
  return useQuery({
    queryKey: qk.spendMix(range),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<SpendMix> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/spend-mix", {
          params: { query: { range } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = SpendMixSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
