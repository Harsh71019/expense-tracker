import { describe, expect, it } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { MoneyOutOfRangeError } from "../../common/errors/money-out-of-range.error.js";
import { assertBalanceDeltaApplied } from "../balance-delta.js";

describe("assertBalanceDeltaApplied", () => {
  it("accepts an applied balance delta", () => {
    expect(() => assertBalanceDeltaApplied("applied")).not.toThrow();
  });

  it("distinguishes missing accounts from range failures", () => {
    expect(() => assertBalanceDeltaApplied("account_not_found")).toThrow(EntityNotFoundError);
    expect(() => assertBalanceDeltaApplied("out_of_range")).toThrow(MoneyOutOfRangeError);
  });
});
