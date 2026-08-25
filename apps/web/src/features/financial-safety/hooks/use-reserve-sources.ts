"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ReserveSourcePageSchema, type ReserveSourcePage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReserveSources(
  initialData: ReserveSourcePage | null,
  limit = 200
): UseQueryResult<ReserveSourcePage | null, Error> {
  return useQuery({
    queryKey: qk.reserveSourceList({ limit }),
    initialData,
    queryFn: async (): Promise<ReserveSourcePage | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-safety/reserve-sources", {
          params: { query: { limit } }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = ReserveSourcePageSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
