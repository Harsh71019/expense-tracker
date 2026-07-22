"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import {
  TransactionPageSchema,
  type ListTransactionsQuery,
  type TransactionPage
} from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

function toQuery(
  filters: ListTransactionsQuery,
  cursor: string | null
): Record<string, string | number | undefined> {
  return {
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    from: filters.from?.toISOString(),
    to: filters.to?.toISOString(),
    q: filters.q,
    cursor: cursor ?? undefined,
    limit: filters.limit
  };
}

export function useTxnList(
  filters: ListTransactionsQuery,
  initialPage: TransactionPage
): UseInfiniteQueryResult<InfiniteData<TransactionPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    TransactionPage,
    Error,
    InfiniteData<TransactionPage, string | null>,
    ReturnType<typeof qk.txns>,
    string | null
  >({
    queryKey: qk.txns(filters),
    initialPageParam: initialCursor,
    initialData: { pages: [initialPage], pageParams: [initialCursor] },
    queryFn: async ({ pageParam }): Promise<TransactionPage> => {
      try {
        const result = await apiClient.GET("/v1/transactions", {
          params: { query: toQuery(filters, pageParam) }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = TransactionPageSchema.safeParse(result.data);
        if (!parsed.success) {
          throw toAppError(undefined, result.response.status);
        }
        return parsed.data;
      } catch (error: unknown) {
        if (error instanceof Error) {
          throw error;
        }
        throw toNetworkError(error);
      }
    },
    getNextPageParam: (page) => (page.pageInfo.hasMore ? page.pageInfo.nextCursor : undefined)
  });
}
