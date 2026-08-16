import { describe, expect, it } from "vitest";

import {
  CreateDeclaredDebtSchema,
  DeclaredDebtKindSchema,
  DeclaredDebtStatusSchema,
  HealthCoverStatusSchema,
  HIGH_COST_DEBT_ANNUAL_RATE_BPS,
  ListDeclaredDebtsQuerySchema,
  MAX_DEBT_ANNUAL_RATE_BPS,
  MAX_DEPENDANT_COUNT,
  TermCoverStatusSchema,
  UpdateDeclaredDebtSchema,
  UpsertProtectionSchema,
  isHighCostDebt
} from "./financial-protection.js";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

function protection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    effectiveFrom: "2026-04-01T00:00:00.000Z",
    termCoverStatus: "none",
    healthCoverStatus: "none",
    dependantCount: 0,
    ...overrides
  };
}

describe("term and health cover statuses", () => {
  it.each(["independent", "employer_only", "both", "none", "not_sure", "not_applicable"] as const)(
    "accepts the %s term cover status",
    (status) => {
      expect(TermCoverStatusSchema.parse(status)).toBe(status);
    }
  );

  it.each(["independent", "employer_only", "both", "none", "not_sure"] as const)(
    "accepts the %s health cover status",
    (status) => {
      expect(HealthCoverStatusSchema.parse(status)).toBe(status);
    }
  );

  it("has no not-applicable health status — everyone can hold health cover", () => {
    expect(HealthCoverStatusSchema.safeParse("not_applicable").success).toBe(false);
  });
});

describe("UpsertProtectionSchema — coverage combinations", () => {
  it("accepts independent term and health cover with their amounts and expiries", () => {
    const parsed = UpsertProtectionSchema.parse(
      protection({
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000,
        independentTermExpiresOn: "2045-04-01T00:00:00.000Z",
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthSuperTopUpMinor: 40_00_000,
        independentHealthExpiresOn: "2027-04-01T00:00:00.000Z",
        dependantCount: 2
      })
    );

    expect(parsed.independentTermCoverMinor).toBe(1_00_00_000);
    expect(parsed.independentHealthSuperTopUpMinor).toBe(40_00_000);
    expect(parsed.employerTermCoverMinor).toBeNull();
  });

  it("accepts employer-only cover carrying only employer amounts", () => {
    const parsed = UpsertProtectionSchema.parse(
      protection({
        termCoverStatus: "employer_only",
        employerTermCoverMinor: 50_00_000,
        healthCoverStatus: "employer_only",
        employerHealthCoverMinor: 5_00_000
      })
    );

    expect(parsed.employerTermCoverMinor).toBe(50_00_000);
    expect(parsed.independentTermCoverMinor).toBeNull();
  });

  it("accepts both-cover carrying independent and employer amounts together", () => {
    const parsed = UpsertProtectionSchema.parse(
      protection({
        termCoverStatus: "both",
        independentTermCoverMinor: 1_00_00_000,
        employerTermCoverMinor: 50_00_000,
        healthCoverStatus: "both",
        independentHealthBaseCoverMinor: 10_00_000,
        employerHealthCoverMinor: 5_00_000
      })
    );

    expect(parsed.independentTermCoverMinor).toBe(1_00_00_000);
    expect(parsed.employerHealthCoverMinor).toBe(5_00_000);
  });

  it("allows a claimed cover with no amount — an unknown sum assured stays honest", () => {
    const parsed = UpsertProtectionSchema.parse(
      protection({ termCoverStatus: "independent", healthCoverStatus: "independent" })
    );

    expect(parsed.independentTermCoverMinor).toBeNull();
    expect(parsed.independentHealthBaseCoverMinor).toBeNull();
  });

  it.each([
    ["none", "independentTermCoverMinor"],
    ["not_sure", "independentTermCoverMinor"],
    ["not_applicable", "independentTermCoverMinor"],
    ["employer_only", "independentTermCoverMinor"],
    ["none", "employerTermCoverMinor"],
    ["not_sure", "employerTermCoverMinor"],
    ["independent", "employerTermCoverMinor"]
  ] as const)("rejects %s term cover carrying %s", (status, field) => {
    const extra: Record<string, unknown> = { [field]: 10_00_000 };
    if (status === "not_applicable") extra["termNotApplicableReason"] = "no_financial_dependants";
    const result = UpsertProtectionSchema.safeParse(
      protection({ termCoverStatus: status, ...extra })
    );

    expect(result.success).toBe(false);
  });

  it.each([
    ["none", "independentHealthBaseCoverMinor"],
    ["not_sure", "independentHealthSuperTopUpMinor"],
    ["employer_only", "independentHealthBaseCoverMinor"],
    ["independent", "employerHealthCoverMinor"],
    ["none", "employerHealthCoverMinor"]
  ] as const)("rejects %s health cover carrying %s", (status, field) => {
    const result = UpsertProtectionSchema.safeParse(
      protection({ healthCoverStatus: status, [field]: 10_00_000 })
    );

    expect(result.success).toBe(false);
  });

  it("rejects an expiry date on a status without independent cover", () => {
    expect(
      UpsertProtectionSchema.safeParse(
        protection({
          termCoverStatus: "employer_only",
          independentTermExpiresOn: "2045-04-01T00:00:00.000Z"
        })
      ).success
    ).toBe(false);
    expect(
      UpsertProtectionSchema.safeParse(
        protection({
          healthCoverStatus: "not_sure",
          independentHealthExpiresOn: "2045-04-01T00:00:00.000Z"
        })
      ).success
    ).toBe(false);
  });
});

describe("UpsertProtectionSchema — not applicable", () => {
  it.each([
    "no_financial_dependants",
    "covered_by_existing_family_arrangement",
    "other_personal_reason"
  ] as const)("accepts the %s structured reason", (reason) => {
    const parsed = UpsertProtectionSchema.parse(
      protection({ termCoverStatus: "not_applicable", termNotApplicableReason: reason })
    );

    expect(parsed.termNotApplicableReason).toBe(reason);
  });

  it("requires a reason when term cover is not applicable", () => {
    const result = UpsertProtectionSchema.safeParse(
      protection({ termCoverStatus: "not_applicable" })
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["termNotApplicableReason"]);
  });

  it.each(["independent", "employer_only", "both", "none", "not_sure"] as const)(
    "rejects a not-applicable reason on the %s status",
    (status) => {
      const result = UpsertProtectionSchema.safeParse(
        protection({
          termCoverStatus: status,
          termNotApplicableReason: "no_financial_dependants"
        })
      );

      expect(result.success).toBe(false);
    }
  );

  it("rejects free text as a not-applicable reason", () => {
    expect(
      UpsertProtectionSchema.safeParse(
        protection({
          termCoverStatus: "not_applicable",
          termNotApplicableReason: "I have a chronic illness"
        })
      ).success
    ).toBe(false);
  });
});

describe("UpsertProtectionSchema — amounts and bounds", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    "rejects %s as a cover amount",
    (amount) => {
      expect(
        UpsertProtectionSchema.safeParse(
          protection({ termCoverStatus: "independent", independentTermCoverMinor: amount })
        ).success
      ).toBe(false);
    }
  );

  it.each([0, 1, MAX_DEPENDANT_COUNT])("accepts a dependant count of %s", (count) => {
    expect(UpsertProtectionSchema.parse(protection({ dependantCount: count })).dependantCount).toBe(
      count
    );
  });

  it.each([-1, 1.5, MAX_DEPENDANT_COUNT + 1])("rejects a dependant count of %s", (count) => {
    expect(UpsertProtectionSchema.safeParse(protection({ dependantCount: count })).success).toBe(
      false
    );
  });

  it("rejects unknown keys so policy numbers and medical notes cannot ride along", () => {
    expect(UpsertProtectionSchema.safeParse(protection({ policyNumber: "LI-99881" })).success).toBe(
      false
    );
    expect(
      UpsertProtectionSchema.safeParse(protection({ medicalHistory: "diabetes" })).success
    ).toBe(false);
  });

  it("requires an effective date", () => {
    const rest = protection();
    delete rest["effectiveFrom"];
    expect(UpsertProtectionSchema.safeParse(rest).success).toBe(false);
  });
});

describe("high-cost debt threshold", () => {
  it("treats exactly 1200 bps as not high cost", () => {
    expect(HIGH_COST_DEBT_ANNUAL_RATE_BPS).toBe(1_200);
    expect(isHighCostDebt(1_200)).toBe(false);
  });

  it("treats 1201 bps as high cost", () => {
    expect(isHighCostDebt(1_201)).toBe(true);
  });

  it.each([0, 1, 1_199])("treats %s bps as not high cost", (bps) => {
    expect(isHighCostDebt(bps)).toBe(false);
  });

  it.each([3_600, 4_200, MAX_DEBT_ANNUAL_RATE_BPS])("treats %s bps as high cost", (bps) => {
    expect(isHighCostDebt(bps)).toBe(true);
  });
});

describe("CreateDeclaredDebtSchema", () => {
  it.each(["credit_card", "bnpl", "personal_loan", "consumer_loan", "other"] as const)(
    "accepts the %s debt kind",
    (kind) => {
      expect(DeclaredDebtKindSchema.parse(kind)).toBe(kind);
    }
  );

  it.each(["active", "resolved"] as const)("accepts the %s debt status", (status) => {
    expect(DeclaredDebtStatusSchema.parse(status)).toBe(status);
  });

  it("accepts an unlinked debt with a declared outstanding amount", () => {
    const parsed = CreateDeclaredDebtSchema.parse({
      name: "Amex revolve",
      kind: "credit_card",
      declaredOutstandingMinor: 85_000_00,
      annualRateBps: 4_200
    });

    expect(parsed.declaredOutstandingMinor).toBe(85_000_00);
    expect(parsed.linkedAssetId).toBeNull();
    expect(parsed.minimumPaymentMinor).toBeNull();
  });

  it("accepts a linked debt with no declared amount", () => {
    const parsed = CreateDeclaredDebtSchema.parse({
      name: "Car loan",
      kind: "consumer_loan",
      annualRateBps: 900,
      linkedAssetId: ASSET_ID
    });

    expect(parsed.linkedAssetId).toBe(ASSET_ID);
    expect(parsed.declaredOutstandingMinor).toBeNull();
  });

  it("rejects an unlinked debt with no outstanding amount", () => {
    const result = CreateDeclaredDebtSchema.safeParse({
      name: "Mystery debt",
      kind: "other",
      annualRateBps: 1_500
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["declaredOutstandingMinor"]);
  });

  it("rejects a linked debt that also declares its own outstanding amount", () => {
    const result = CreateDeclaredDebtSchema.safeParse({
      name: "Car loan",
      kind: "consumer_loan",
      annualRateBps: 900,
      linkedAssetId: ASSET_ID,
      declaredOutstandingMinor: 3_00_000
    });

    expect(result.success).toBe(false);
  });

  it.each([-1, MAX_DEBT_ANNUAL_RATE_BPS + 1, 12.5])("rejects an annual rate of %s bps", (bps) => {
    expect(
      CreateDeclaredDebtSchema.safeParse({
        name: "Loan",
        kind: "personal_loan",
        annualRateBps: bps,
        declaredOutstandingMinor: 1_000_00
      }).success
    ).toBe(false);
  });

  it.each([0, MAX_DEBT_ANNUAL_RATE_BPS])("accepts an annual rate of %s bps", (bps) => {
    expect(
      CreateDeclaredDebtSchema.parse({
        name: "Loan",
        kind: "personal_loan",
        annualRateBps: bps,
        declaredOutstandingMinor: 1_000_00
      }).annualRateBps
    ).toBe(bps);
  });

  it.each([0, -100, 12.34])("rejects a declared outstanding amount of %s", (amount) => {
    expect(
      CreateDeclaredDebtSchema.safeParse({
        name: "Loan",
        kind: "personal_loan",
        annualRateBps: 1_500,
        declaredOutstandingMinor: amount
      }).success
    ).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(
      CreateDeclaredDebtSchema.safeParse({
        name: "Card",
        kind: "credit_card",
        annualRateBps: 4_200,
        declaredOutstandingMinor: 10_000_00,
        cardNumber: "4111111111111111"
      }).success
    ).toBe(false);
  });

  it("rejects a blank name", () => {
    expect(
      CreateDeclaredDebtSchema.safeParse({
        name: "   ",
        kind: "credit_card",
        annualRateBps: 4_200,
        declaredOutstandingMinor: 10_000_00
      }).success
    ).toBe(false);
  });
});

describe("UpdateDeclaredDebtSchema", () => {
  it("accepts a metadata-only update", () => {
    expect(UpdateDeclaredDebtSchema.parse({ name: "Renamed card" }).name).toBe("Renamed card");
  });

  it("accepts resolving a debt", () => {
    expect(UpdateDeclaredDebtSchema.parse({ status: "resolved" }).status).toBe("resolved");
  });

  it("rejects reactivating a resolved debt", () => {
    expect(UpdateDeclaredDebtSchema.safeParse({ status: "active" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(UpdateDeclaredDebtSchema.safeParse({}).success).toBe(false);
  });

  it("rejects relinking through the update body", () => {
    expect(UpdateDeclaredDebtSchema.safeParse({ linkedAssetId: ASSET_ID }).success).toBe(false);
  });

  it("allows clearing a minimum payment but never the outstanding estimate", () => {
    expect(UpdateDeclaredDebtSchema.parse({ minimumPaymentMinor: null }).minimumPaymentMinor).toBe(
      null
    );
    expect(UpdateDeclaredDebtSchema.safeParse({ declaredOutstandingMinor: null }).success).toBe(
      false
    );
  });
});

describe("ListDeclaredDebtsQuerySchema", () => {
  it("defaults to active debts with a bounded page size", () => {
    expect(ListDeclaredDebtsQuerySchema.parse({})).toMatchObject({ status: "active", limit: 50 });
  });

  it("accepts an explicit status filter and coerces the limit", () => {
    expect(ListDeclaredDebtsQuerySchema.parse({ status: "resolved", limit: "10" })).toMatchObject({
      status: "resolved",
      limit: 10
    });
  });

  it.each([0, 201])("rejects a limit of %s", (limit) => {
    expect(ListDeclaredDebtsQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});
