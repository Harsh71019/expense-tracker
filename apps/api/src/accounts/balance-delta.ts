import { EntityNotFoundError } from "../common/errors/entity-not-found.error.js";
import { MoneyOutOfRangeError } from "../common/errors/money-out-of-range.error.js";
import type { BalanceDeltaResult } from "./account.repository.js";

export function assertBalanceDeltaApplied(result: BalanceDeltaResult): void {
  if (result === "applied") return;
  if (result === "out_of_range") throw new MoneyOutOfRangeError();
  throw new EntityNotFoundError("Account");
}
