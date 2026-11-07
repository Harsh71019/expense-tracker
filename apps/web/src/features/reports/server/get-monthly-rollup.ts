import { MonthlyReportSchema, type MonthlyReport } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getMonthlyRollup = cache(async (month: string): Promise<MonthlyReport | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/reports/monthly/{month}", {
      params: { path: { month } }
    });
    if (result.response.status === 404) return null;
    const parsed = MonthlyReportSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("monthly rollup response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("monthly rollup request failed", error);
    return null;
  }
});
