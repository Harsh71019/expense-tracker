import { TransactionPageSchema, type TransactionPage } from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

const TRANSFER_PAGE_LIMIT = 100;

function emptyPage(): TransactionPage {
  return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: TRANSFER_PAGE_LIMIT } };
}

/**
 * There's no GET /v1/transfers endpoint — a transfer is just two Transaction
 * legs sharing a transferGroupId, so the transfers list is derived from the
 * transaction feed (see transfer-list.tsx for the pairing logic).
 */
export const getTransferPage = cache(async (): Promise<TransactionPage> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/transactions", {
      params: { query: { limit: TRANSFER_PAGE_LIMIT } }
    });
    const parsed = TransactionPageSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("transfers response failed validation", parsed.error.flatten());
      return emptyPage();
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("transfers request failed", error);
    return emptyPage();
  }
});
