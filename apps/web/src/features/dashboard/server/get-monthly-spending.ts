import { MonthlySpendingSchema, type MonthlySpending } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getMonthlySpending = cache(async (): Promise<MonthlySpending | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/monthly-spending");
    const parsed = MonthlySpendingSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("dashboard monthly spending response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("dashboard monthly spending request failed", error);
    return null;
  }
});
