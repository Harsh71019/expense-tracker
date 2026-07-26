"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import { SpendingWarningPageSchema, type SpendingWarningPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

import {
  SPENDING_WARNING_PAGE_LIMIT,
  toApiKind,
  type SpendingWarningFilters
} from "../model/filters";

function toQuery(
  filters: SpendingWarningFilters,
  cursor: string | null
): Record<string, string | number | undefined> {
  return {
    kind: toApiKind(filters.filter),
    cursor: cursor ?? undefined,
    limit: SPENDING_WARNING_PAGE_LIMIT
  };
}

export function useSpendingWarnings(
  filters: SpendingWarningFilters,
  initialPage: SpendingWarningPage | null
): UseInfiniteQueryResult<InfiniteData<SpendingWarningPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    SpendingWarningPage,
    Error,
    InfiniteData<SpendingWarningPage, string | null>,
    ReturnType<typeof qk.spendingWarningList>,
    string | null
  >({
    queryKey: qk.spendingWarningList(filters),
    initialPageParam: initialCursor,
    ...(initialPage === null
      ? {}
      : { initialData: { pages: [initialPage], pageParams: [initialCursor] } }),
    queryFn: async ({ pageParam }): Promise<SpendingWarningPage> => {
      try {
        const result = await apiClient.GET("/v1/spending-warnings", {
          params: { query: toQuery(filters, pageParam) }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = SpendingWarningPageSchema.safeParse(result.data);
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
