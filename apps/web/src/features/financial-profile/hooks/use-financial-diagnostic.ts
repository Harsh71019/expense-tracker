"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { FinancialDiagnosticSchema, type FinancialDiagnostic } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useFinancialDiagnostic(
  initialData: FinancialDiagnostic | null,
  asOf?: string
): UseQueryResult<FinancialDiagnostic | null, Error> {
  return useQuery({
    queryKey: qk.financialDiagnostic(asOf),
    initialData,
    queryFn: async (): Promise<FinancialDiagnostic | null> => {
      try {
        const result = await apiClient.GET("/v1/financial-profile/diagnostic", {
          params: {
            query: asOf ? { asOf } : {}
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = FinancialDiagnosticSchema.safeParse(result.data);
        return parsed.success ? parsed.data : null;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
