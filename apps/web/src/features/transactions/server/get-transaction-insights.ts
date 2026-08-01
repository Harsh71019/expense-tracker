import { TransactionInsightsSchema, type TransactionInsights } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getTransactionInsights = cache(async (): Promise<TransactionInsights | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/transactions/insights");
    const parsed = TransactionInsightsSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("transaction insights response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("transaction insights request failed", error);
    return null;
  }
});
