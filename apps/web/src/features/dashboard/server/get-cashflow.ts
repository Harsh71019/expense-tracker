import {
  CashflowResponseSchema,
  type CashflowResponse,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

function empty(range: DashboardRange): CashflowResponse {
  return { range, buckets: [] };
}

export const getCashflow = cache(async (range: DashboardRange): Promise<CashflowResponse> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/cashflow", { params: { query: { range } } });
    const parsed = CashflowResponseSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("dashboard cashflow response failed validation", parsed.error.flatten());
      return empty(range);
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("dashboard cashflow request failed", error);
    return empty(range);
  }
});
