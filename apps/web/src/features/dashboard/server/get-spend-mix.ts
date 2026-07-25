import { SpendMixSchema, type SpendMix, type DashboardRange } from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

function empty(range: DashboardRange): SpendMix {
  return {
    range,
    totalMinor: 0,
    essential: { amountMinor: 0, pct: 0 },
    lifestyle: { amountMinor: 0, pct: 0 },
    uncategorized: { amountMinor: 0, pct: 0 }
  };
}

export const getSpendMix = cache(async (range: DashboardRange): Promise<SpendMix> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/spend-mix", { params: { query: { range } } });
    const parsed = SpendMixSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("dashboard spend-mix response failed validation", parsed.error.flatten());
      return empty(range);
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("dashboard spend-mix request failed", error);
    return empty(range);
  }
});
