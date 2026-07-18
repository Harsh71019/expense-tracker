"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { ImportBatchSchema, type ColumnMapping, type ImportBatch } from "@vyaya/shared";

import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export type UploadImportRequest = Readonly<{
  file: File;
  accountId: string;
  mapping: ColumnMapping;
}>;

export function useUploadImport(): UseMutationResult<ImportBatch, Error, UploadImportRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, accountId, mapping }): Promise<ImportBatch> => {
      const body = new FormData();
      body.append("file", file);
      body.append("accountId", accountId);
      body.append("mapping", JSON.stringify(mapping));
      try {
        if (process.env.NEXT_PUBLIC_MOCK_API === "1") {
          const { ensureMockWorkerStarted } = await import("@/mocks/browser");
          await ensureMockWorkerStarted();
        }
        // Generated multipart types model a binary File as string, so this single FormData boundary uses fetch.
        const response = await fetch("/api/v1/imports", {
          method: "POST",
          body,
          credentials: "include"
        });
        const payload: unknown = await response.json().catch(() => undefined);
        if (!response.ok) throw toAppError(payload, response.status);
        const parsed = ImportBatchSchema.safeParse(payload);
        if (!parsed.success) throw toAppError(undefined, response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    onSuccess: async (_batch, request) => {
      await queryClient.invalidateQueries({ queryKey: qk.importMapping(request.accountId) });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.importBatches() })
  });
}
