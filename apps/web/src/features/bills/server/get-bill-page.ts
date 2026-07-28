import { BillPageSchema, type BillPage, type ListBillsQuery } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

function emptyPage(limit: number): BillPage {
  return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit } };
}

function toQuery(filters: ListBillsQuery): Record<string, string | number | undefined> {
  return {
    accountId: filters.accountId,
    reconciliationStatus: filters.reconciliationStatus,
    paymentStatus: filters.paymentStatus,
    cursor: filters.cursor,
    limit: filters.limit
  };
}

export const getBillPage = cache(async (filters: ListBillsQuery): Promise<BillPage> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/bills", { params: { query: toQuery(filters) } });
    const parsed = BillPageSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("bills response failed validation", parsed.error.flatten());
      return emptyPage(filters.limit);
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("bills request failed", error);
    return emptyPage(filters.limit);
  }
});
