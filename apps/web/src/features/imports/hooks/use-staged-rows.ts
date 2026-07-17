"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import { StagedRowPageSchema, type StagedRowPage } from "@vyaya/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useStagedRows(
  batchId: string,
  initialPage: StagedRowPage
): UseInfiniteQueryResult<InfiniteData<StagedRowPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    StagedRowPage,
    Error,
    InfiniteData<StagedRowPage, string | null>,
    readonly ["import-preview", string],
    string | null
  >({
    queryKey: qk.importPreview(batchId),
    initialPageParam: initialCursor,
    initialData: { pages: [initialPage], pageParams: [initialCursor] },
    queryFn: async ({ pageParam }): Promise<StagedRowPage> => {
      try {
        const query = pageParam === null ? { limit: 50 } : { cursor: pageParam, limit: 50 };
        const result = await apiClient.GET("/v1/imports/{importBatchId}/preview", {
          params: { path: { importBatchId: batchId }, query }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = StagedRowPageSchema.safeParse(result.data);
        if (!parsed.success) throw toAppError(undefined, result.response.status);
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) throw error;
        throw toNetworkError(error);
      }
    },
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined)
  });
}
