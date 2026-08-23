import {
  AccountInsightsSchema,
  type AccountInsights,
  type AccountInsightsRange
} from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

export const getAccountInsights = cache(
  async (accountId: string, range: AccountInsightsRange): Promise<AccountInsights | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/accounts/{accountId}/insights", {
        params: { path: { accountId }, query: { range } }
      });
      const parsed = AccountInsightsSchema.safeParse(result.data);
      if (!parsed.success) {
        debug.api("account insights response failed validation", parsed.error.flatten());
        return null;
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("account insights request failed", error);
      return null;
    }
  }
);
