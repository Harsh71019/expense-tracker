"use client";

import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult
} from "@tanstack/react-query";
import { BillPageSchema, type BillPage, type ListBillsQuery } from "@treasury-ops/shared";

import { apiClient } from "@/lib/api/client";
import { toAppError, toNetworkError } from "@/lib/api/problem";
import { qk } from "@/lib/query/keys";

function queryFor(
  filters: ListBillsQuery,
  cursor: string | null
): {
  accountId?: string;
  reconciliationStatus?: "awaiting_statement" | "reconciled";
  paymentStatus?: "unpaid" | "partial" | "paid";
  cursor?: string;
  limit: number;
} {
  return {
    ...(filters.accountId === undefined ? {} : { accountId: filters.accountId }),
    ...(filters.reconciliationStatus === undefined
      ? {}
      : { reconciliationStatus: filters.reconciliationStatus }),
    ...(filters.paymentStatus === undefined ? {} : { paymentStatus: filters.paymentStatus }),
    ...(cursor === null ? {} : { cursor }),
    limit: filters.limit
  };
}

export function useBills(
  filters: ListBillsQuery,
  initialPage: BillPage
): UseInfiniteQueryResult<InfiniteData<BillPage, string | null>, Error> {
  const initialCursor: string | null = null;
  return useInfiniteQuery<
    BillPage,
    Error,
    InfiniteData<BillPage, string | null>,
    ReturnType<typeof qk.billList>,
    string | null
  >({
    queryKey: qk.billList(filters),
    initialPageParam: initialCursor,
    initialData: { pages: [initialPage], pageParams: [initialCursor] },
    queryFn: async ({ pageParam }): Promise<BillPage> => {
      try {
        const result = await apiClient.GET("/v1/bills", {
          params: { query: queryFor(filters, pageParam) }
        });
        if (result.error !== undefined) throw toAppError(result.error, result.response.status);
        const parsed = BillPageSchema.safeParse(result.data);
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
