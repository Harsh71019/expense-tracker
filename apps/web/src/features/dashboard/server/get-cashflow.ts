import {
  CashflowResponseSchema,
  type CashflowResponse,
  type DashboardRange
} from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

function empty(range: DashboardRange): CashflowResponse {
  return { range, buckets: [] };
}

export const getCashflow = cache(async (range: DashboardRange): Promise<CashflowResponse> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/dashboard/cashflow", { params: { query: { range } } });
    const parsed = CashflowResponseSchema.safeParse(result.data);
    return parsed.success ? parsed.data : empty(range);
  } catch {
    return empty(range);
  }
});
