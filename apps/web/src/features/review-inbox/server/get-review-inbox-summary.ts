import { ReviewInboxSummarySchema, type ReviewInboxSummary } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

export const getReviewInboxSummary = cache(async (): Promise<ReviewInboxSummary | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/review-inbox/summary");
    if (result.error !== undefined) {
      debug.api("review inbox summary request failed", result.error);
      return null;
    }
    const parsed = ReviewInboxSummarySchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("review inbox summary response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("review inbox summary request failed", error);
    return null;
  }
});
