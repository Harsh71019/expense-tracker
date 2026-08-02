import {
  RecurringReconciliationReviewItemSchema,
  type RecurringReconciliationReviewItem
} from "@treasury-ops/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

const RecurringReconciliationsSchema = z.array(RecurringReconciliationReviewItemSchema);

/**
 * Server-side fetch of pending (ambiguous / amount_mismatch, unresolved)
 * recurring reconciliations, for the /recurring page's review section. A
 * failed or malformed request returns `[]` -- there's no meaningful
 * distinction between "none pending" and "couldn't load" for this small,
 * secondary panel (unlike getSpendingWarnings, which needs to tell those
 * apart), so it degrades to an empty list rather than a nullable result.
 */
export const getRecurringReconciliations = cache(
  async (): Promise<RecurringReconciliationReviewItem[]> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/recurring/reconciliations", {
        params: { query: { status: "pending" } }
      });
      if (result.error !== undefined) {
        debug.api("recurring reconciliations request failed", result.error);
        return [];
      }
      const parsed = RecurringReconciliationsSchema.safeParse(result.data);
      if (!parsed.success) {
        debug.api("recurring reconciliations response failed validation", parsed.error.flatten());
        return [];
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("recurring reconciliations request failed", error);
      return [];
    }
  }
);
