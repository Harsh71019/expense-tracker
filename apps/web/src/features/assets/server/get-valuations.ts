import { ValuationPageSchema, type ValuationPage } from "@vyaya/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getValuations = cache(async (assetId: string): Promise<ValuationPage | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/assets/{assetId}/valuations", {
      params: { path: { assetId } }
    });
    const parsed = ValuationPageSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
