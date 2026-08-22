"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import { ReceivableEventPageSchema, type ReceivableEventPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

export function useReceivableEvents(
  receivableId: string
): UseInfiniteQueryResult<InfiniteData<ReceivableEventPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    ReceivableEventPage,
    Error,
    InfiniteData<ReceivableEventPage, string | null>,
    ReturnType<typeof qk.receivableEvents>,
    string | null
  >({
    queryKey: qk.receivableEvents(receivableId),
    initialPageParam: initialCursor,
    queryFn: async ({ pageParam }): Promise<ReceivableEventPage> => {
      const result = await apiClient.GET("/v1/receivables/{receivableId}/events", {
        params: {
          path: { receivableId },
          query: { ...(pageParam === null ? {} : { cursor: pageParam }) }
        }
      });
      if (result.error !== undefined) throw toAppError(result.error, result.response.status);
      const parsed = ReceivableEventPageSchema.safeParse(result.data);
      if (!parsed.success) throw toAppError(undefined, result.response.status);
      return parsed.data;
    },
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined)
  });
}
