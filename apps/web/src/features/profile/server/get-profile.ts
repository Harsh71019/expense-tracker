import { UserProfileSchema, type UserProfile } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getProfile = cache(async (): Promise<UserProfile | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/profile");
    const parsed = UserProfileSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
