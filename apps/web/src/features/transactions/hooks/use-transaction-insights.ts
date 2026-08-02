"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { TransactionInsightsSchema, type TransactionInsights } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useTransactionInsights(
  initialData: TransactionInsights | null
): UseQueryResult<TransactionInsights, Error> {
  return useQuery({
    queryKey: qk.transactionInsights(),
    ...(initialData === null ? {} : { initialData }),
    queryFn: async (): Promise<TransactionInsights> => {
      try {
        const result = await apiClient.GET("/v1/transactions/insights");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = TransactionInsightsSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
