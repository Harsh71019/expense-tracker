import { HttpStatus } from "@nestjs/common";

import { DomainError } from "./domain-error.js";

/**
 * The asset a debt tried to link to is not available to this user: it does not
 * exist, belongs to someone else, or has been closed. All three answer the same
 * way, so probing ids cannot distinguish "not yours" from "not there".
 */
export class LinkedAssetUnavailableError extends DomainError {
  readonly code = "financial_profile.linked_asset_unavailable";
  readonly status = HttpStatus.NOT_FOUND;
  readonly retryable = false;

  constructor() {
    super("That asset is not available to link. Pick an open loan liability you own.");
  }
}
