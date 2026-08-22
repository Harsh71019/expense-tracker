"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ReceivableSummarySchema, type ReceivableSummary } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReceivableSummary(
  initialData?: ReceivableSummary
): UseQueryResult<ReceivableSummary, Error> {
  return useQuery({
    queryKey: qk.receivableSummary(),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<ReceivableSummary> => {
      const result = await apiClient.GET("/v1/receivables/summary");
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReceivableSummarySchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    }
  });
}
