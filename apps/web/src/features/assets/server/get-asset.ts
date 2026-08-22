import { AssetSchema, type Asset } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getAsset = cache(async (assetId: string): Promise<Asset | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/assets/{assetId}", {
      params: { path: { assetId } }
    });
    if (result.error !== undefined || result.data === undefined) {
      return null;
    }
    const parsed = AssetSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
