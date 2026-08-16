import type { ReactNode } from "react";

import {
  getReviewInbox,
  getReviewInboxSummary,
  parseReviewInboxFilters,
  ReviewInboxPage
} from "@/features/review-inbox";

export default async function ReviewRoute({
  searchParams
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<ReactNode> {
  const filters = parseReviewInboxFilters(await searchParams);
  const [initialPage, summary] = await Promise.all([
    getReviewInbox(filters),
    getReviewInboxSummary()
  ]);

  return (
    <ReviewInboxPage
      initialPage={initialPage ?? { items: [], nextCursor: null, totalActive: 0 }}
      summary={summary}
      filters={filters}
    />
  );
}
