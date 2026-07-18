import { AssetSchema, type Asset } from "@vyaya/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const AssetsSchema = z.array(AssetSchema);

export const getAssets = cache(async (): Promise<Asset[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/assets");
    const parsed = AssetsSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
