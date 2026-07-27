export const ErrorCodes = [
  "common.validation_failed",
  "common.not_found",
  "common.invalid_cursor",
  "common.internal",
  "common.dependency_unavailable",
  "money.out_of_range",
  "auth.unauthenticated",
  "auth.insufficient_scope",
  "auth.rate_limited",
  "txn.already_reversed",
  "txn.transfer_metadata_requires_group",
  "category.parent_kind_mismatch",
  "category.kind_mismatch",
  "asset.invalid_valuation_sign",
  "goal.funding_source_in_use",
  "goal.invalid_order",
  "import.invalid_file",
  "import.already_committed",
  "import.invalid_state",
  "recurring.no_occurrences"
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];
