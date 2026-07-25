"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  TopSpendingItemSchema,
  type TopSpendingItem,
  type DashboardRange
} from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const TopSpendingListSchema = z.array(TopSpendingItemSchema);

export function useTopSpending(
  range: DashboardRange,
  limit: number,
  initialData?: TopSpendingItem[]
): UseQueryResult<TopSpendingItem[], Error> {
  return useQuery({
    queryKey: qk.topSpending(range, limit),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<TopSpendingItem[]> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/top-spending", {
          params: { query: { range, limit } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = TopSpendingListSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
