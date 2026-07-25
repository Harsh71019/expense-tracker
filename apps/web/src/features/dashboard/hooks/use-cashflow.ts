"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  CashflowResponseSchema,
  type CashflowResponse,
  type DashboardRange
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useCashflow(
  range: DashboardRange,
  initialData?: CashflowResponse
): UseQueryResult<CashflowResponse, Error> {
  return useQuery({
    queryKey: qk.cashflow(range),
    ...(initialData === undefined ? {} : { initialData }),
    queryFn: async (): Promise<CashflowResponse> => {
      try {
        const result = await apiClient.GET("/v1/dashboard/cashflow", {
          params: { query: { range } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = CashflowResponseSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
