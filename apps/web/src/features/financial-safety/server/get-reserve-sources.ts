import "server-only";

import { ReserveSourcePageSchema, type ReserveSourcePage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

/**
 * Initial authenticated server-side render fetcher for reserve source
 * candidates. A transport failure or schema mismatch fails closed to `null`
 * rather than showing an unauthenticated or partially-typed page.
 */
export const getReserveSources = cache(async (limit = 200): Promise<ReserveSourcePage | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/financial-safety/reserve-sources", {
      params: { query: { limit } }
    });
    const parsed = ReserveSourcePageSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
