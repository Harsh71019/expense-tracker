import { HIGH_COST_DEBT_ANNUAL_RATE_BPS, type Asset } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  bpsToPercentLabel,
  emptyDebtFormValues,
  highCostThresholdLabel,
  linkableAssets,
  parseDebtForm,
  type DebtFormValues
} from "./debt-form";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

function values(overrides: Partial<DebtFormValues> = {}): DebtFormValues {
  return { ...emptyDebtFormValues(), name: "Amex revolve", annualRatePercent: "42", ...overrides };
}

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: ASSET_ID,
    userId: "user-a",
    kind: "loan_liability",
    name: "Car loan",
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    isClosed: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

describe("percentage to basis points", () => {
  it("converts a whole percentage through the validated helper", () => {
    const result = parseDebtForm(values({ declaredOutstandingMinor: 85_000_00 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.annualRateBps).toBe(4_200);
  });

  it.each([
    ["13.5", 1_350],
    ["13.05", 1_305],
    ["0", 0],
    ["12", 1_200]
  ])("converts %s%% to %i bps", (percent, bps) => {
    const result = parseDebtForm(
      values({ annualRatePercent: percent, declaredOutstandingMinor: 1_000_00 })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.annualRateBps).toBe(bps);
  });

  it.each(["", "abc", "12.345", "-4", "1e3"])("rejects %j as a rate", (annualRatePercent) => {
    const result = parseDebtForm(values({ annualRatePercent, declaredOutstandingMinor: 1_000_00 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors["debt-rate"]).toBeDefined();
  });

  it("rejects a rate beyond the supported range", () => {
    const result = parseDebtForm(
      values({ annualRatePercent: "1001", declaredOutstandingMinor: 1_000_00 })
    );

    expect(result.ok).toBe(false);
  });

  it("renders basis points back as a display percentage", () => {
    expect(bpsToPercentLabel(4_200)).toBe("42%");
    expect(bpsToPercentLabel(1_350)).toBe("13.50%");
    expect(bpsToPercentLabel(1_305)).toBe("13.05%");
  });

  it("derives the high-cost threshold label from the shared constant", () => {
    expect(highCostThresholdLabel()).toBe("12%");
    expect(highCostThresholdLabel(HIGH_COST_DEBT_ANNUAL_RATE_BPS)).toBe("12%");
  });
});

describe("parseDebtForm", () => {
  it("builds an unlinked debt with its declared estimate", () => {
    const result = parseDebtForm(values({ declaredOutstandingMinor: 85_000_00 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Amex revolve",
      kind: "credit_card",
      declaredOutstandingMinor: 85_000_00,
      linkedAssetId: null,
      minimumPaymentMinor: null
    });
  });

  it("sends no outstanding amount at all for a linked debt", () => {
    const result = parseDebtForm(
      values({
        kind: "consumer_loan",
        annualRatePercent: "9",
        linkedAssetId: ASSET_ID,
        // Left over from typing before linking; must not be sent.
        declaredOutstandingMinor: 3_00_000_00
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.declaredOutstandingMinor).toBeNull();
    expect(result.value.linkedAssetId).toBe(ASSET_ID);
  });

  it("requires an amount when the debt is not linked, and points at that field", () => {
    const result = parseDebtForm(values({ declaredOutstandingMinor: 0 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors["debt-outstanding"]).toBeDefined();
    expect(result.firstFieldId).toBe("debt-outstanding");
  });

  it("requires a name and reports it first", () => {
    const result = parseDebtForm(values({ name: "  ", declaredOutstandingMinor: 0 }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.firstFieldId).toBe("debt-name");
  });

  it("keeps an optional minimum payment out of the body when it is zero", () => {
    const result = parseDebtForm(
      values({ declaredOutstandingMinor: 85_000_00, minimumPaymentMinor: 0 })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.minimumPaymentMinor).toBeNull();
  });
});

describe("linkableAssets", () => {
  it("offers only open loan liabilities", () => {
    const options = linkableAssets([
      asset(),
      asset({ id: "22222222-2222-4222-8222-222222222222", isClosed: true, name: "Closed loan" }),
      asset({ id: "33333333-3333-4333-8333-333333333333", kind: "investment", name: "Index fund" }),
      asset({ id: "44444444-4444-4444-8444-444444444444", kind: "gold", name: "Gold" })
    ]);

    expect(options.map((option) => option.name)).toEqual(["Car loan"]);
  });

  it("returns nothing when the user has no loan liabilities", () => {
    expect(linkableAssets([asset({ kind: "fixed_deposit" })])).toEqual([]);
  });
});
