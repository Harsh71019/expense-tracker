import { SpendingWarningPageSchema, type SpendingWarningPage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

import {
  SPENDING_WARNING_PAGE_LIMIT,
  toApiKind,
  type SpendingWarningFilters
} from "../model/filters";

function toQuery(filters: SpendingWarningFilters): Record<string, string | number | undefined> {
  return { kind: toApiKind(filters.filter), limit: SPENDING_WARNING_PAGE_LIMIT };
}

/**
 * Server-side first-page fetch for /spending-warnings (plan §3). Unlike
 * getTxnPage/getMonthlyRollup, a failed or malformed request returns `null`
 * rather than an empty-but-valid page — the page needs to tell "the read
 * failed" (plan §5.5, fetch failure) apart from "the read succeeded and
 * there are zero/no-matching warnings" (plan §5.2/§5.6), which look
 * identical if both collapse to an empty items array.
 */
export const getSpendingWarnings = cache(
  async (filters: SpendingWarningFilters): Promise<SpendingWarningPage | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/spending-warnings", {
        params: { query: toQuery(filters) }
      });
      if (result.error !== undefined) {
        debug.api("spending warnings request failed", result.error);
        return null;
      }
      const parsed = SpendingWarningPageSchema.safeParse(result.data);
      if (!parsed.success) {
        debug.api("spending warnings response failed validation", parsed.error.flatten());
        return null;
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("spending warnings request failed", error);
      return null;
    }
  }
);
