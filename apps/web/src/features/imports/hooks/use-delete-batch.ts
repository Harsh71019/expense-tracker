"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useDeleteBatch(): UseMutationResult<undefined, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId): Promise<undefined> => {
      try {
        const result = await apiClient.DELETE("/v1/imports/{importBatchId}", {
          params: { path: { importBatchId: batchId } }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        return undefined;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.importBatches() });
    }
  });
}
