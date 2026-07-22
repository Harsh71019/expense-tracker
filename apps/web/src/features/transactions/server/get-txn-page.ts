import {
  TransactionPageSchema,
  type ListTransactionsQuery,
  type TransactionPage
} from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

function emptyPage(limit: number): TransactionPage {
  return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit } };
}

function toQuery(filters: ListTransactionsQuery): Record<string, string | number | undefined> {
  return {
    accountId: filters.accountId,
    categoryId: filters.categoryId,
    from: filters.from?.toISOString(),
    to: filters.to?.toISOString(),
    q: filters.q,
    cursor: filters.cursor,
    limit: filters.limit
  };
}

export const getTxnPage = cache(
  async (filters: ListTransactionsQuery): Promise<TransactionPage> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/transactions", { params: { query: toQuery(filters) } });
      const parsed = TransactionPageSchema.safeParse(result.data);
      if (!parsed.success) {
        debug.api("transactions response failed validation", parsed.error.flatten());
        return emptyPage(filters.limit);
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("transactions request failed", error);
      return emptyPage(filters.limit);
    }
  }
);
