"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  ImportReconciliationSummarySchema,
  type ImportReconciliationSummary
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useImportReconciliation(
  batchId: string,
  enabled = true
): UseQueryResult<ImportReconciliationSummary, Error> {
  return useQuery({
    queryKey: qk.importReconciliation(batchId),
    enabled,
    queryFn: async (): Promise<ImportReconciliationSummary> => {
      try {
        const result = await apiClient.GET("/v1/imports/{importBatchId}/reconciliation", {
          params: { path: { importBatchId: batchId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ImportReconciliationSummarySchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
