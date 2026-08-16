import { DetectedStreamPageSchema, type DetectedStreamPage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getDetectedStreams = cache(async (): Promise<DetectedStreamPage> => {
  const client = await getServerApiClient();
  const result = await client.GET("/v1/recurring/detected", { params: { query: { limit: 50 } } });
  if (result.error !== undefined) return { items: [], nextCursor: null };
  const parsed = DetectedStreamPageSchema.safeParse(result.data);
  return parsed.success ? parsed.data : { items: [], nextCursor: null };
});
