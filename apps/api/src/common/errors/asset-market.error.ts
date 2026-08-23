import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

export class AssetMarketLinkRequiredError extends DomainError {
  readonly code = "asset_market.link_required" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("Link this asset to a market instrument before recording a position.");
  }
}

export class AssetPositionEventAlreadyReversedError extends DomainError {
  readonly code = "asset_position_event.already_reversed" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("This position event has already been reversed.");
  }
}

export class AssetPositionEventNotReversibleError extends DomainError {
  readonly code = "asset_position_event.not_reversible" as const;
  readonly status = HttpStatus.CONFLICT;
  readonly retryable = false;

  constructor() {
    super("A reversal event cannot itself be reversed.");
  }
}
