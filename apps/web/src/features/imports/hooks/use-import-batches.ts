"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { ImportBatchSchema, type ImportBatch } from "@vyaya/shared";
import { z } from "zod";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

const ImportBatchesSchema = z.array(ImportBatchSchema);

export function useImportBatches(
  initialData?: ImportBatch[]
): UseQueryResult<ImportBatch[], Error> {
  return useQuery({
    queryKey: qk.importBatches(),
    ...(initialData === undefined ? {} : { placeholderData: initialData }),
    queryFn: async (): Promise<ImportBatch[]> => {
      try {
        const result = await apiClient.GET("/v1/imports");
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = ImportBatchesSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    }
  });
}
