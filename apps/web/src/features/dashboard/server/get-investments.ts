import { DashboardInvestmentsSchema, type DashboardInvestments } from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

export const getInvestments = cache(async (): Promise<DashboardInvestments> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/investments");
    const parsed = DashboardInvestmentsSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("dashboard investments response failed validation", parsed.error.flatten());
      return { items: [] };
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("dashboard investments request failed", error);
    return { items: [] };
  }
});
