import { ReviewInboxPageSchema, type ReviewInboxPage } from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

import {
  REVIEW_INBOX_PAGE_LIMIT,
  toApiSourceType,
  type ReviewInboxFilters
} from "../model/filters";

export const getReviewInbox = cache(
  async (filters: ReviewInboxFilters): Promise<ReviewInboxPage | null> => {
    try {
      const client = await getServerApiClient();
      const sourceType = toApiSourceType(filters.filter);
      const queryParams: {
        limit: number;
        status: typeof filters.status;
        sourceType?: NonNullable<typeof sourceType>;
        cursor?: string;
      } = {
        limit: REVIEW_INBOX_PAGE_LIMIT,
        status: filters.status
      };
      if (sourceType !== undefined) {
        queryParams.sourceType = sourceType;
      }
      if (filters.cursor !== undefined) {
        queryParams.cursor = filters.cursor;
      }
      const result = await client.GET("/v1/review-inbox", {
        params: {
          query: queryParams
        }
      });
      if (result.error !== undefined) {
        debug.api("review inbox request failed", result.error);
        return null;
      }
      const parsed = ReviewInboxPageSchema.safeParse(result.data);
      if (!parsed.success) {
        debug.api("review inbox response failed validation", parsed.error.flatten());
        return null;
      }
      return parsed.data;
    } catch (error: unknown) {
      debug.api("review inbox request failed", error);
      return null;
    }
  }
);
