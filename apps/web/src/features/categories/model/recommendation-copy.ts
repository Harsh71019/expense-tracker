import type { CategoryRecommendationReason } from "@treasury-ops/shared";

export function recommendationReasonCopy(reason: CategoryRecommendationReason): string {
  switch (reason) {
    case "explicit_rule":
      return "Rule match";
    case "exact_counterparty":
      return "Same merchant";
    case "similar_description":
      return "Similar entries";
    case "frequent":
      return "Frequently used";
    case "recent":
      return "Recently used";
  }
}

export function recommendationReasonDetail(
  reason: CategoryRecommendationReason,
  evidenceCount: number
): string {
  switch (reason) {
    case "explicit_rule":
      return "Recommended by one of your category rules";
    case "exact_counterparty":
      return `Used for this merchant in ${evidenceCount} prior entries`;
    case "similar_description":
      return `Used for similar descriptions in ${evidenceCount} prior entries`;
    case "frequent":
      return `Used in ${evidenceCount} prior entries`;
    case "recent":
      return "One of your recent category choices";
  }
}
