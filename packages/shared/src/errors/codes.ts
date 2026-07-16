export const ErrorCodes = [
  "common.validation_failed",
  "common.not_found",
  "common.invalid_cursor",
  "common.internal",
  "common.dependency_unavailable",
  "auth.unauthenticated",
  "txn.already_reversed",
  "asset.invalid_valuation_sign",
  "import.invalid_file",
  "import.already_committed"
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];
