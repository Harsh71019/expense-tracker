import { NetWorthSchema, type NetWorth } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getNetWorth = cache(async (): Promise<NetWorth | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/net-worth");
    const parsed = NetWorthSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
