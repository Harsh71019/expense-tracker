import { PROTECTION_EXPIRING_SOON_DAYS, type ProtectionSnapshot } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  deriveExpiryState,
  deriveProtectionState,
  istCalendarDaysUntil
} from "../protection-state.js";

const ASOF = new Date("2026-08-16T00:00:00.000Z");

function snapshot(overrides: Partial<ProtectionSnapshot> = {}): ProtectionSnapshot {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-a",
    effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
    termCoverStatus: "none",
    independentTermCoverMinor: null,
    employerTermCoverMinor: null,
    independentTermExpiresOn: null,
    termNotApplicableReason: null,
    healthCoverStatus: "none",
    independentHealthBaseCoverMinor: null,
    independentHealthSuperTopUpMinor: null,
    employerHealthCoverMinor: null,
    independentHealthExpiresOn: null,
    dependantCount: 0,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides
  };
}

function stateOf(overrides: Partial<ProtectionSnapshot> = {}, asOf: Date = ASOF) {
  return deriveProtectionState({
    snapshot: snapshot(overrides),
    upcomingSnapshot: null,
    asOf
  });
}

describe("deriveProtectionState — not configured", () => {
  it("reports an explicit unknown state rather than a safe default", () => {
    const state = deriveProtectionState({ snapshot: null, upcomingSnapshot: null, asOf: ASOF });

    expect(state).toMatchObject({
      configured: false,
      currentSnapshot: null,
      dataQuality: "unavailable",
      termCover: { state: "not_configured", expiryState: "not_applicable" },
      healthCover: { state: "not_configured" }
    });
    expect(state.limitations).toContain(
      "No protection answers recorded yet, so protection status is unknown rather than safe."
    );
  });

  it("still surfaces a future-dated snapshot before it takes effect", () => {
    const upcoming = snapshot({ effectiveFrom: new Date("2027-01-01T00:00:00.000Z") });
    const state = deriveProtectionState({ snapshot: null, upcomingSnapshot: upcoming, asOf: ASOF });

    expect(state.configured).toBe(false);
    expect(state.upcomingSnapshot?.effectiveFrom).toEqual(new Date("2027-01-01T00:00:00.000Z"));
  });
});

describe("deriveProtectionState — coverage states", () => {
  it("reports employer-only cover as its own state with an employment warning", () => {
    const state = stateOf({
      termCoverStatus: "employer_only",
      employerTermCoverMinor: 50_00_000,
      healthCoverStatus: "employer_only",
      employerHealthCoverMinor: 5_00_000
    });

    expect(state.termCover).toMatchObject({
      state: "employer_only",
      hasIndependentCover: false,
      hasEmployerCover: true
    });
    expect(state.limitations).toContain(
      "Term life cover is employer-provided only and may end with your employment."
    );
    expect(state.limitations).toContain(
      "Health cover is employer-provided only and may end with your employment."
    );
  });

  it("keeps employer-only distinguishable from independent cover", () => {
    const employer = stateOf({ termCoverStatus: "employer_only", employerTermCoverMinor: 1 });
    const independent = stateOf({
      termCoverStatus: "independent",
      independentTermCoverMinor: 1
    });

    expect(employer.termCover.state).not.toBe(independent.termCover.state);
    expect(independent.termCover).toMatchObject({
      state: "complete",
      hasIndependentCover: true,
      hasEmployerCover: false
    });
  });

  it("reports 'not sure' as unknown, never as covered or uncovered", () => {
    const state = stateOf({ termCoverStatus: "not_sure", healthCoverStatus: "not_sure" });

    expect(state.termCover.state).toBe("unknown");
    expect(state.healthCover.state).toBe("unknown");
    expect(state.dataQuality).toBe("limited");
    expect(state.limitations).toContain(
      'Term life cover is recorded as "not sure", so it is treated as unknown.'
    );
  });

  it("reports a structured not-applicable term cover without warning about it", () => {
    const state = stateOf({
      termCoverStatus: "not_applicable",
      termNotApplicableReason: "no_financial_dependants"
    });

    expect(state.termCover.state).toBe("not_applicable");
    expect(state.dataQuality).toBe("complete");
    expect(state.limitations).toEqual([]);
  });

  it("reports declared absence of cover as its own state, not as missing data", () => {
    const state = stateOf();

    expect(state.termCover.state).toBe("none_declared");
    expect(state.healthCover.state).toBe("none_declared");
    expect(state.dataQuality).toBe("complete");
  });

  it("reports a claimed cover with no amount as incomplete", () => {
    const state = stateOf({ termCoverStatus: "independent", healthCoverStatus: "independent" });

    expect(state.termCover.state).toBe("incomplete");
    expect(state.healthCover.state).toBe("incomplete");
    expect(state.dataQuality).toBe("limited");
    expect(state.limitations).toContain(
      "Term life cover amount is not recorded, so the cover cannot be assessed."
    );
  });

  it("requires both amounts before 'both' counts as complete", () => {
    expect(
      stateOf({
        termCoverStatus: "both",
        independentTermCoverMinor: 1_00_00_000
      }).termCover.state
    ).toBe("incomplete");
    expect(
      stateOf({
        termCoverStatus: "both",
        independentTermCoverMinor: 1_00_00_000,
        employerTermCoverMinor: 50_00_000
      }).termCover.state
    ).toBe("complete");
  });

  it("treats the health base cover, not the super top-up, as what makes health assessable", () => {
    expect(
      stateOf({
        healthCoverStatus: "independent",
        independentHealthSuperTopUpMinor: 40_00_000
      }).healthCover.state
    ).toBe("incomplete");
    expect(
      stateOf({
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthSuperTopUpMinor: 40_00_000
      }).healthCover.state
    ).toBe("complete");
  });

  it("notes a future-dated snapshot as a limitation on the current answer", () => {
    const state = deriveProtectionState({
      snapshot: snapshot(),
      upcomingSnapshot: snapshot({ effectiveFrom: new Date("2027-01-01T00:00:00.000Z") }),
      asOf: ASOF
    });

    expect(state.limitations).toContain(
      "A future-dated protection snapshot exists and is not reflected above."
    );
  });

  it("never reports a complete state while an answer is missing", () => {
    const state = stateOf({
      termCoverStatus: "independent",
      healthCoverStatus: "not_sure"
    });

    expect(state.dataQuality).not.toBe("complete");
  });
});

describe("expiry boundaries in Asia/Kolkata", () => {
  // 2026-08-16T00:00:00Z is 2026-08-16 05:30 IST, so "today" in IST is the 16th.
  const asOfIst = new Date("2026-08-16T00:00:00.000Z");

  it("counts whole IST calendar days regardless of the time of day", () => {
    // 18:29Z is 23:59 IST on the same IST day; one minute later is the next.
    expect(istCalendarDaysUntil(new Date("2026-08-16T18:29:00.000Z"), asOfIst)).toBe(0);
    expect(istCalendarDaysUntil(new Date("2026-08-17T00:00:00.000Z"), asOfIst)).toBe(1);
    expect(istCalendarDaysUntil(new Date("2026-08-15T18:29:00.000Z"), asOfIst)).toBe(-1);
  });

  it("treats a UTC instant that is already tomorrow in IST as tomorrow", () => {
    // 2026-08-16T18:30:00Z is 2026-08-17 00:00 IST.
    expect(istCalendarDaysUntil(new Date("2026-08-16T18:30:00.000Z"), asOfIst)).toBe(1);
  });

  it("has no expiry state without an expiry date", () => {
    expect(deriveExpiryState(null, asOfIst)).toBe("not_applicable");
  });

  it("expires the day after the recorded expiry, not on it", () => {
    expect(deriveExpiryState(new Date("2026-08-16T00:00:00.000Z"), asOfIst)).toBe("expiring");
    expect(deriveExpiryState(new Date("2026-08-15T00:00:00.000Z"), asOfIst)).toBe("expired");
  });

  it("flags the last day of the expiring window as expiring and the next as active", () => {
    const lastExpiringDay = new Date(
      asOfIst.getTime() + PROTECTION_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1_000
    );
    const firstActiveDay = new Date(lastExpiringDay.getTime() + 24 * 60 * 60 * 1_000);

    expect(deriveExpiryState(lastExpiringDay, asOfIst)).toBe("expiring");
    expect(deriveExpiryState(firstActiveDay, asOfIst)).toBe("active");
  });

  it("marks an expired independent policy as stale data, not complete", () => {
    const state = stateOf(
      {
        termCoverStatus: "independent",
        independentTermCoverMinor: 1_00_00_000,
        independentTermExpiresOn: new Date("2026-01-01T00:00:00.000Z")
      },
      asOfIst
    );

    expect(state.termCover.expiryState).toBe("expired");
    expect(state.dataQuality).toBe("stale");
    expect(state.limitations).toContain("Your independent term policy expiry date has passed.");
  });

  it("warns about an expiring health policy while the cover is still complete", () => {
    const state = stateOf(
      {
        healthCoverStatus: "independent",
        independentHealthBaseCoverMinor: 10_00_000,
        independentHealthExpiresOn: new Date("2026-09-01T00:00:00.000Z")
      },
      asOfIst
    );

    expect(state.healthCover).toMatchObject({ state: "complete", expiryState: "expiring" });
    expect(state.limitations).toContain(
      `Your independent health policy expires within ${PROTECTION_EXPIRING_SOON_DAYS} days.`
    );
  });
});
