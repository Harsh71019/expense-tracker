"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { ImportBatchSchema, type ImportBatch } from "@vyaya/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useCommitBatch(): UseMutationResult<ImportBatch, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId): Promise<ImportBatch> => {
      try {
        const result = await apiClient.POST("/v1/imports/{importBatchId}/commit", {
          params: { path: { importBatchId: batchId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ImportBatchSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.importBatches() });
      void queryClient.invalidateQueries({ queryKey: qk.accounts() });
      void queryClient.invalidateQueries({ queryKey: ["txns"] });
    }
  });
}
