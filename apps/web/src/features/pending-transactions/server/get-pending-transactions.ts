import { PendingTransactionSchema, type PendingTransaction } from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

const PendingTransactionsSchema = z.array(PendingTransactionSchema);

/**
 * Server-side fetch of pending (amount-unknown) transactions for the
 * transactions page's "needs your input" panel. Mirrors
 * getRecurringReconciliations: a failed or malformed request degrades to
 * `[]` rather than surfacing an error, since this is a small secondary
 * panel, not the primary transaction list.
 */
export const getPendingTransactions = cache(async (): Promise<PendingTransaction[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/pending-transactions", {
      params: { query: { status: "pending" } }
    });
    if (result.error !== undefined) {
      debug.api("pending transactions request failed", result.error);
      return [];
    }
    const parsed = PendingTransactionsSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("pending transactions response failed validation", parsed.error.flatten());
      return [];
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("pending transactions request failed", error);
    return [];
  }
});
