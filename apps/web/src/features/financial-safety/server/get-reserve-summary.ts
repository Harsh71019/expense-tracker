import "server-only";

import { ReserveSummarySchema, type ReserveSummary } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

/**
 * Initial authenticated server-side render fetcher for the reserve
 * aggregate. A transport failure or schema mismatch fails closed to `null`.
 */
export const getReserveSummary = cache(async (asOf?: string): Promise<ReserveSummary | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/financial-safety/reserves", {
      params: { query: asOf ? { asOf } : {} }
    });
    const parsed = ReserveSummarySchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
