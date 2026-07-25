"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import { BudgetPageSchema, type BudgetPage } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

type UseBudgetsOptions = Readonly<{
  includeArchived: boolean;
  limit: number;
  initialPage?: BudgetPage;
}>;

export function useBudgets({
  includeArchived,
  limit,
  initialPage
}: UseBudgetsOptions): UseInfiniteQueryResult<InfiniteData<BudgetPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    BudgetPage,
    Error,
    InfiniteData<BudgetPage, string | null>,
    ReturnType<typeof qk.budgetList>,
    string | null
  >({
    queryKey: qk.budgetList({ includeArchived, limit }),
    initialPageParam: initialCursor,
    ...(initialPage === undefined
      ? {}
      : { initialData: { pages: [initialPage], pageParams: [initialCursor] } }),
    queryFn: async ({ pageParam }): Promise<BudgetPage> => {
      try {
        const result = await apiClient.GET("/v1/budgets", {
          params: {
            query: {
              includeArchived: includeArchived ? "true" : "false",
              limit,
              ...(pageParam === null ? {} : { cursor: pageParam })
            }
          }
        });
        if (result.error !== undefined) {
          throw toAppError(result.error, result.response.status);
        }
        const parsed = BudgetPageSchema.safeParse(result.data);
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
