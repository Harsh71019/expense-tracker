"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { StagedRowSchema, type StagedRow, type UpdateStagedRow } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

type UpdateStagedRowRequest = UpdateStagedRow & Readonly<{ batchId: string; stagedRowId: string }>;
type DefinedUpdate =
  | Readonly<{ include: boolean }>
  | Readonly<{ suggestedCategoryId: string | null }>
  | Readonly<{ include: boolean; suggestedCategoryId: string | null }>
  | Readonly<{ matchedTransactionId: string | null }>;

async function patchRow(
  batchId: string,
  stagedRowId: string,
  body: DefinedUpdate
): Promise<StagedRow> {
  const result = await apiClient.PATCH("/v1/imports/{importBatchId}/rows/{stagedRowId}", {
    params: { path: { importBatchId: batchId, stagedRowId } },
    body
  });
  if (result.error !== undefined) throw toAppError(result.error, result.response.status);
  const parsed = StagedRowSchema.safeParse(result.data);
  if (!parsed.success) throw toAppError(undefined, result.response.status);
  return parsed.data;
}

export function useUpdateStagedRow(): UseMutationResult<StagedRow, Error, UpdateStagedRowRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      batchId,
      stagedRowId,
      include,
      suggestedCategoryId,
      matchedTransactionId
    }): Promise<StagedRow> => {
      try {
        if (matchedTransactionId !== undefined) {
          return await patchRow(batchId, stagedRowId, { matchedTransactionId });
        }
        if (include === undefined) {
          if (suggestedCategoryId === undefined) {
            throw new Error("A staged-row update requires at least one field.");
          }
          return await patchRow(batchId, stagedRowId, { suggestedCategoryId });
        }
        if (suggestedCategoryId === undefined)
          return await patchRow(batchId, stagedRowId, { include });
        return await patchRow(batchId, stagedRowId, { include, suggestedCategoryId });
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSettled: async (_data, _error, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.importPreview(variables.batchId) }),
        queryClient.invalidateQueries({ queryKey: qk.importReconciliation(variables.batchId) })
      ]);
    }
  });
}
