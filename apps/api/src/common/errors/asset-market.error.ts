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

export class MarketQuoteUnavailableError extends DomainError {
  readonly code = "asset_market.quote_unavailable" as const;
  readonly status = HttpStatus.SERVICE_UNAVAILABLE;
  readonly retryable = true;

  constructor(message = "No current market quote is available for this instrument.") {
    super(message);
  }
}

export class UnsupportedTaxContextError extends DomainError {
  readonly code = "asset_market.tax_context_unsupported" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(
    message = "The declared tax scenario or instrument type is outside the supported estimation rules."
  ) {
    super(message);
  }
}

export class InsufficientDisposalContextError extends DomainError {
  readonly code = "asset_market.disposal_context_insufficient" as const;
  readonly status = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly retryable = false;

  constructor(
    message = "Required lot dates, cost basis, or quote context is missing for this disposal calculation."
  ) {
    super(message);
  }
}
