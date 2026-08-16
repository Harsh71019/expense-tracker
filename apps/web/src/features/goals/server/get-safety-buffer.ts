import { SafetyBufferStateSchema, type SafetyBufferState } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getSafetyBuffer = cache(async (): Promise<SafetyBufferState | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/safety-buffer");
    const parsed = SafetyBufferStateSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
