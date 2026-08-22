import { ValuationPageSchema, type ValuationPage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getValuations = cache(async (assetId: string): Promise<ValuationPage> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/assets/{assetId}/valuations", {
      params: { path: { assetId } }
    });
    if (result.error !== undefined || result.data === undefined) {
      return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 0 } };
    }
    const parsed = ValuationPageSchema.safeParse(result.data);
    return parsed.success
      ? parsed.data
      : { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 0 } };
  } catch {
    return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 0 } };
  }
});
