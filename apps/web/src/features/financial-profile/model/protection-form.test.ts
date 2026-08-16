import type { ProtectionSnapshot } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  COVERAGE_STATE_LABELS,
  initialProtectionValues,
  isSettledCoverageState,
  parseProtectionForm,
  showEmployerHealthFields,
  showEmployerTermFields,
  showIndependentHealthFields,
  showIndependentTermFields,
  showTermNotApplicableReason,
  type ProtectionFormValues
} from "./protection-form";

function values(overrides: Partial<ProtectionFormValues> = {}): ProtectionFormValues {
  return {
    effectiveFrom: "2026-04-01",
    termCoverStatus: "none",
    termNotApplicableReason: "",
    independentTermCoverMinor: 0,
    employerTermCoverMinor: 0,
    independentTermExpiresOn: "",
    healthCoverStatus: "none",
    independentHealthBaseCoverMinor: 0,
    independentHealthSuperTopUpMinor: 0,
    employerHealthCoverMinor: 0,
    independentHealthExpiresOn: "",
    dependantCount: "0",
    ...overrides
  };
}

describe("conditional field visibility", () => {
  it.each([
    ["independent", true, false],
    ["employer_only", false, true],
    ["both", true, true],
    ["none", false, false],
    ["not_sure", false, false],
    ["not_applicable", false, false]
  ] as const)("shows the right term fields for %s", (status, independent, employer) => {
    expect(showIndependentTermFields(status)).toBe(independent);
    expect(showEmployerTermFields(status)).toBe(employer);
  });

  it.each([
    ["independent", true, false],
    ["employer_only", false, true],
    ["both", true, true],
    ["none", false, false],
    ["not_sure", false, false]
  ] as const)("shows the right health fields for %s", (status, independent, employer) => {
    expect(showIndependentHealthFields(status)).toBe(independent);
    expect(showEmployerHealthFields(status)).toBe(employer);
  });

  it("asks for a reason only when term cover does not apply", () => {
    expect(showTermNotApplicableReason("not_applicable")).toBe(true);
    expect(showTermNotApplicableReason("not_sure")).toBe(false);
    expect(showTermNotApplicableReason("none")).toBe(false);
  });
});

describe("parseProtectionForm", () => {
  it("converts an independent answer into the canonical body", () => {
    const result = parseProtectionForm(
      values({
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000,
        independentTermExpiresOn: "2045-04-01",
        healthCoverStatus: "both",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthSuperTopUpMinor: 40_00_000,
        employerHealthCoverMinor: 5_00_000,
        dependantCount: "2"
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      termCoverStatus: "independent",
      independentTermCoverMinor: 1_00_00_000,
      employerTermCoverMinor: null,
      independentHealthSuperTopUpMinor: 40_00_000,
      dependantCount: 2
    });
    expect(result.value.independentTermExpiresOn).toEqual(new Date("2045-04-01T00:00:00.000Z"));
  });

  it("drops amounts behind hidden fields when the status no longer claims that cover", () => {
    const result = parseProtectionForm(
      values({
        termCoverStatus: "not_sure",
        // Left over from a previous "independent" selection.
        independentTermCoverMinor: 1_00_00_000,
        independentTermExpiresOn: "2045-04-01",
        healthCoverStatus: "employer_only",
        independentHealthBaseCoverMinor: 10_00_000,
        employerHealthCoverMinor: 5_00_000
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      independentTermCoverMinor: null,
      independentTermExpiresOn: null,
      independentHealthBaseCoverMinor: null,
      employerHealthCoverMinor: 5_00_000
    });
  });

  it("treats a zero amount as not recorded rather than as zero cover", () => {
    const result = parseProtectionForm(
      values({ termCoverStatus: "independent", independentTermCoverMinor: 0 })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.independentTermCoverMinor).toBeNull();
  });

  it("requires a structured reason when term cover does not apply", () => {
    const result = parseProtectionForm(values({ termCoverStatus: "not_applicable" }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors["protection-term-reason"]).toBeDefined();
    expect(result.firstFieldId).toBe("protection-term-reason");
  });

  it("accepts a not-applicable answer with its reason", () => {
    const result = parseProtectionForm(
      values({
        termCoverStatus: "not_applicable",
        termNotApplicableReason: "no_financial_dependants"
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.termNotApplicableReason).toBe("no_financial_dependants");
  });

  it("drops a stale reason when the status is no longer not-applicable", () => {
    const result = parseProtectionForm(
      values({
        termCoverStatus: "none",
        termNotApplicableReason: "no_financial_dependants"
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.termNotApplicableReason).toBeNull();
  });

  it.each(["", "-1", "1.5", "21", "two"])(
    "rejects %j as a dependant count and points at that field",
    (dependantCount) => {
      const result = parseProtectionForm(values({ dependantCount }));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors["protection-dependants"]).toBeDefined();
      expect(result.firstFieldId).toBe("protection-dependants");
    }
  );

  it("requires an effective date", () => {
    const result = parseProtectionForm(values({ effectiveFrom: "  " }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors["protection-effective-from"]).toBeDefined();
  });
});

describe("initialProtectionValues", () => {
  it("starts unknown rather than assuming cover when nothing is recorded", () => {
    const initial = initialProtectionValues(null);

    expect(initial.termCoverStatus).toBe("not_sure");
    expect(initial.healthCoverStatus).toBe("not_sure");
    expect(initial.dependantCount).toBe("0");
  });

  it("prefills from the effective snapshot but defaults the effective date to today", () => {
    const snapshot: ProtectionSnapshot = {
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-a",
      effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
      termCoverStatus: "both",
      independentTermCoverMinor: 1_00_00_000,
      employerTermCoverMinor: 50_00_000,
      independentTermExpiresOn: new Date("2045-04-01T00:00:00.000Z"),
      termNotApplicableReason: null,
      healthCoverStatus: "independent",
      independentHealthBaseCoverMinor: 10_00_000,
      independentHealthSuperTopUpMinor: null,
      employerHealthCoverMinor: null,
      independentHealthExpiresOn: null,
      dependantCount: 3,
      createdAt: new Date("2026-04-01T00:00:00.000Z")
    };

    const initial = initialProtectionValues(snapshot);

    expect(initial).toMatchObject({
      termCoverStatus: "both",
      independentTermCoverMinor: 1_00_00_000,
      employerTermCoverMinor: 50_00_000,
      independentTermExpiresOn: "2045-04-01",
      healthCoverStatus: "independent",
      independentHealthSuperTopUpMinor: 0,
      dependantCount: "3"
    });
    expect(initial.effectiveFrom).not.toBe("2026-04-01");
  });
});

describe("coverage state presentation", () => {
  it("labels every coverage state in words, never by colour alone", () => {
    expect(COVERAGE_STATE_LABELS.employer_only).toBe("Employer only");
    expect(COVERAGE_STATE_LABELS.unknown).toBe("Not sure");
    expect(COVERAGE_STATE_LABELS.incomplete).toBe("Amount missing");
    expect(COVERAGE_STATE_LABELS.not_configured).toBe("Not recorded");
  });

  it("treats only recorded and not-applicable answers as settled", () => {
    expect(isSettledCoverageState("complete")).toBe(true);
    expect(isSettledCoverageState("not_applicable")).toBe(true);
    expect(isSettledCoverageState("employer_only")).toBe(false);
    expect(isSettledCoverageState("unknown")).toBe(false);
    expect(isSettledCoverageState("incomplete")).toBe(false);
    expect(isSettledCoverageState("none_declared")).toBe(false);
  });
});
