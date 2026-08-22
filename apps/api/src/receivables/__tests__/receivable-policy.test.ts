import { describe, expect, it } from "vitest";

import { ReceivableCorrectionUnderflowError } from "../../common/errors/receivable-correction-underflow.error.js";
import { ReceivableOverpaymentError } from "../../common/errors/receivable-overpayment.error.js";
import {
  assertCorrectionWithinBounds,
  assertNotOverpaying,
  deriveReceivableStatus
} from "../receivable-policy.js";
import type { ReceivableBalance } from "../receivable.repository.js";

function balance(overrides: Partial<ReceivableBalance>): ReceivableBalance {
  return {
    outstandingMinor: 0,
    confirmedRepaidMinor: 0,
    repaymentCount: 0,
    hasEffectiveOpening: false,
    ...overrides
  };
}

describe("deriveReceivableStatus", () => {
  it("is active while outstanding is positive", () => {
    expect(deriveReceivableStatus(balance({ outstandingMinor: 1 }))).toBe("active");
  });

  it("is settled when outstanding reached zero after an effective opening", () => {
    expect(
      deriveReceivableStatus(balance({ outstandingMinor: 0, hasEffectiveOpening: true }))
    ).toBe("settled");
  });

  it("is cancelled when outstanding is zero because the opening itself was reversed", () => {
    expect(
      deriveReceivableStatus(balance({ outstandingMinor: 0, hasEffectiveOpening: false }))
    ).toBe("cancelled");
  });
});

describe("assertNotOverpaying", () => {
  it("allows a repayment equal to the outstanding amount", () => {
    expect(() => assertNotOverpaying(10_000, 10_000)).not.toThrow();
  });

  it("allows a repayment smaller than the outstanding amount", () => {
    expect(() => assertNotOverpaying(10_000, 2_500)).not.toThrow();
  });

  it("rejects a repayment larger than the outstanding amount", () => {
    expect(() => assertNotOverpaying(10_000, 10_001)).toThrow(ReceivableOverpaymentError);
  });
});

describe("assertCorrectionWithinBounds", () => {
  it("allows any increase regardless of outstanding", () => {
    expect(() => assertCorrectionWithinBounds(0, "increase", 5_000)).not.toThrow();
  });

  it("allows a decrease up to the outstanding amount", () => {
    expect(() => assertCorrectionWithinBounds(10_000, "decrease", 10_000)).not.toThrow();
  });

  it("rejects a decrease larger than the outstanding amount", () => {
    expect(() => assertCorrectionWithinBounds(10_000, "decrease", 10_001)).toThrow(
      ReceivableCorrectionUnderflowError
    );
  });
});
