import { MarketRatesSchema, type MarketRates } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getMarketRates = cache(async (): Promise<MarketRates | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/assets/market-rates");
    if (result.error !== undefined || result.data === undefined) {
      return null;
    }
    const parsed = MarketRatesSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
