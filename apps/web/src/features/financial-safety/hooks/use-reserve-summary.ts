"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ReserveSummarySchema, type ReserveSummary } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReserveSummary(
  initialData: ReserveSummary | null,
  asOf?: string
): UseQueryResult<ReserveSummary | null, Error> {
  return useQuery({
    queryKey: qk.reserveSummary(asOf),
    initialData,
    queryFn: async (): Promise<ReserveSummary | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-safety/reserves", {
          params: { query: asOf ? { asOf } : {} }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = ReserveSummarySchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
