"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { RecentActivityItemSchema, type RecentActivityItem } from "@treasury-ops/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const RecentActivityListSchema = z.array(RecentActivityItemSchema);

export function useRecentActivity(
  limit: number,
  initialData?: RecentActivityItem[]
): UseQueryResult<RecentActivityItem[], Error> {
  return useQuery({
    queryKey: qk.recentActivity(limit),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<RecentActivityItem[]> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/recent-activity", {
          params: { query: { limit } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = RecentActivityListSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
