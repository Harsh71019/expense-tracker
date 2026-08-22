import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class AssetFundingSourceNotEligibleError extends DomainError {
  readonly code = "asset_funding.source_not_eligible" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
  constructor() {
    super("Transaction is not eligible to fund an asset.");
  }
}

export class AssetFundingAlreadyLinkedError extends DomainError {
  readonly code = "asset_funding.already_linked" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
  constructor() {
    super("Transaction already has an active asset funding.");
  }
}

export class AssetFundingNotReversibleError extends DomainError {
  readonly code = "asset_funding.not_reversible" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
  constructor() {
    super("Asset funding cannot be reversed.");
  }
}

export class AssetFundingAssetUnavailableError extends DomainError {
  readonly code = "asset_funding.asset_unavailable" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;
  constructor() {
    super("Asset is unavailable for funding.");
  }
}
