import type { ReviewItemSourceType, ReviewItemStatus } from "@treasury-ops/shared";

export type ReviewFilterType = "all" | "category" | "recurring" | "changes";

export interface ReviewInboxFilters {
  readonly filter: ReviewFilterType;
  readonly status: ReviewItemStatus;
  readonly cursor?: string;
}

export const REVIEW_INBOX_PAGE_LIMIT = 50;

export function toApiSourceType(filter: ReviewFilterType): ReviewItemSourceType | undefined {
  switch (filter) {
    case "category":
      return "category_suggestion";
    case "recurring":
      return "recurring_stream";
    case "changes":
      return "recurring_change";
    case "all":
    default:
      return undefined;
  }
}

export function parseReviewInboxFilters(
  params: Record<string, string | string[] | undefined>
): ReviewInboxFilters {
  const filterParam = typeof params.filter === "string" ? params.filter : "all";
  const validFilter: ReviewFilterType =
    filterParam === "category" || filterParam === "recurring" || filterParam === "changes"
      ? filterParam
      : "all";

  const statusParam = typeof params.status === "string" ? params.status : "active";
  const validStatus: ReviewItemStatus =
    statusParam === "dismissed" || statusParam === "resolved" || statusParam === "superseded"
      ? statusParam
      : "active";

  const cursor =
    typeof params.cursor === "string" && params.cursor.length > 0 ? params.cursor : undefined;

  const base = {
    filter: validFilter,
    status: validStatus
  };

  return cursor !== undefined ? { ...base, cursor } : base;
}
