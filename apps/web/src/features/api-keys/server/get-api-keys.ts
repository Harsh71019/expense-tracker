import { ApiKeySchema, type ApiKey } from "@vyaya/shared";
import { cache } from "react";
import { z } from "zod";

import { getServerApiClient } from "@/lib/api/server";

const ApiKeysSchema = z.array(ApiKeySchema);

export const getApiKeys = cache(async (): Promise<ApiKey[]> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/api-keys");
    const parsed = ApiKeysSchema.safeParse(result.data);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
});
