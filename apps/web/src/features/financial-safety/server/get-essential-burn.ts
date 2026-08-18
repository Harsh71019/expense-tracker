import "server-only";

import { EssentialBurnResponseSchema, type EssentialBurnResponse } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

/**
 * Initial authenticated server-side render fetcher for the essential burn baseline.
 * A transport failure or schema mismatch fails closed to `null`.
 */
export const getEssentialBurn = cache(
  async (asOf?: string): Promise<EssentialBurnResponse | null> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/financial-safety/essential-burn", {
        params: {
          query: asOf ? { asOf } : {}
        }
      });
      const parsed = EssentialBurnResponseSchema.safeParse(result.data);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
);
