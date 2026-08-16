import { render, screen } from "@testing-library/react";
import type {
  ProtectionCoverageSummary,
  ProtectionSnapshot,
  ProtectionState
} from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { ProtectionSummary } from "./protection-summary";

function cover(overrides: Partial<ProtectionCoverageSummary> = {}): ProtectionCoverageSummary {
  return {
    state: "none_declared",
    expiryState: "not_applicable",
    expiresOn: null,
    hasIndependentCover: false,
    hasEmployerCover: false,
    ...overrides
  };
}

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

function state(overrides: Partial<ProtectionState> = {}): ProtectionState {
  return {
    configured: true,
    currentSnapshot: snapshot(),
    upcomingSnapshot: null,
    asOf: new Date("2026-08-16T00:00:00.000Z"),
    dataQuality: "complete",
    termCover: cover(),
    healthCover: cover(),
    expiringSoonDays: 90,
    limitations: [],
    ...overrides
  };
}

describe("ProtectionSummary states", () => {
  it("renders an explicit unknown state when nothing is configured", () => {
    render(
      <ProtectionSummary
        state={state({
          configured: false,
          currentSnapshot: null,
          dataQuality: "unavailable",
          termCover: cover({ state: "not_configured" }),
          healthCover: cover({ state: "not_configured" })
        })}
      />
    );

    expect(screen.getByText("Protection not recorded yet")).toBeVisible();
    expect(screen.getByText("Unknown")).toBeVisible();
    expect(screen.getByText(/not as covered, and not as uncovered/)).toBeVisible();
  });

  it("renders a load failure without implying anything about cover", () => {
    render(<ProtectionSummary state={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(/could not load your protection answers/);
    expect(screen.queryByText("Recorded")).toBeNull();
  });

  it("labels employer-only cover in words and warns it may end with employment", () => {
    render(
      <ProtectionSummary
        state={state({
          dataQuality: "limited",
          termCover: cover({ state: "employer_only", hasEmployerCover: true }),
          limitations: [
            "Term life cover is employer-provided only and may end with your employment."
          ],
          currentSnapshot: snapshot({
            termCoverStatus: "employer_only",
            employerTermCoverMinor: 50_00_000
          })
        })}
      />
    );

    expect(screen.getByText("Employer only")).toBeVisible();
    expect(
      screen.getByText(/Employer-provided only\. Cover of this kind usually ends/)
    ).toBeVisible();
    expect(
      screen.getByText(
        "Term life cover is employer-provided only and may end with your employment."
      )
    ).toBeVisible();
  });

  it("labels a not-sure answer as unknown rather than as cover", () => {
    render(
      <ProtectionSummary
        state={state({
          dataQuality: "limited",
          healthCover: cover({ state: "unknown" })
        })}
      />
    );

    expect(screen.getByText("Not sure")).toBeVisible();
    expect(screen.getByText(/treated as unknown, never as covered/)).toBeVisible();
  });

  it("says an amount is missing rather than showing zero", () => {
    render(
      <ProtectionSummary
        state={state({
          termCover: cover({ state: "incomplete", hasIndependentCover: true }),
          currentSnapshot: snapshot({ termCoverStatus: "independent" })
        })}
      />
    );

    expect(screen.getByText("Amount missing")).toBeVisible();
    expect(screen.getAllByText("Not recorded").length).toBeGreaterThan(0);
  });

  it("shows a recorded amount without claiming it is enough", () => {
    render(
      <ProtectionSummary
        state={state({
          termCover: cover({ state: "complete", hasIndependentCover: true }),
          currentSnapshot: snapshot({
            termCoverStatus: "independent",
            independentTermCoverMinor: 1_00_00_000
          })
        })}
      />
    );

    expect(screen.getByText("Recorded")).toBeVisible();
    expect(screen.getByText(/says what you hold, not whether it is enough/)).toBeVisible();
  });

  it("shows a not-applicable term answer as settled", () => {
    render(
      <ProtectionSummary
        state={state({
          termCover: cover({ state: "not_applicable" }),
          currentSnapshot: snapshot({
            termCoverStatus: "not_applicable",
            termNotApplicableReason: "no_financial_dependants"
          })
        })}
      />
    );

    expect(screen.getByText("Not applicable")).toBeVisible();
  });

  it("shows an expiring policy with its date and state", () => {
    render(
      <ProtectionSummary
        state={state({
          termCover: cover({
            state: "complete",
            expiryState: "expiring",
            expiresOn: new Date("2026-09-01T00:00:00.000Z"),
            hasIndependentCover: true
          }),
          limitations: ["Your independent term policy expires within 90 days."]
        })}
      />
    );

    expect(screen.getByText(/Expiring soon/)).toBeVisible();
    expect(screen.getByText("Your independent term policy expires within 90 days.")).toBeVisible();
  });

  it("shows an expired policy explicitly", () => {
    render(
      <ProtectionSummary
        state={state({
          dataQuality: "stale",
          termCover: cover({
            state: "complete",
            expiryState: "expired",
            expiresOn: new Date("2026-01-01T00:00:00.000Z"),
            hasIndependentCover: true
          }),
          limitations: ["Your independent term policy expiry date has passed."]
        })}
      />
    );

    expect(screen.getByText(/Expired/)).toBeVisible();
    expect(screen.getByText("Your independent term policy expiry date has passed.")).toBeVisible();
  });

  it("announces a future-dated snapshot without applying it", () => {
    render(
      <ProtectionSummary
        state={state({
          upcomingSnapshot: snapshot({
            id: "22222222-2222-4222-8222-222222222222",
            effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
            termCoverStatus: "independent",
            independentTermCoverMinor: 2_00_00_000
          })
        })}
      />
    );

    expect(screen.getByText(/A future-dated set of answers takes effect on/)).toBeVisible();
    expect(screen.getByText(/The summary above shows what applies today/)).toBeVisible();
  });

  it("never renders a green safe verdict for a completed form", () => {
    const { container } = render(
      <ProtectionSummary
        state={state({
          termCover: cover({ state: "complete", hasIndependentCover: true }),
          healthCover: cover({ state: "complete", hasIndependentCover: true })
        })}
      />
    );

    expect(screen.queryByText(/safe/i)).toBeNull();
    expect(screen.queryByText(/protected/i)).toBeNull();
    expect(container.querySelector(".text-income")).toBeNull();
  });

  it("gives each cover card an accessible name and a text description", () => {
    render(<ProtectionSummary state={state()} />);

    const term = screen.getByRole("region", { name: "Term life cover" });
    const health = screen.getByRole("region", { name: "Health cover" });

    expect(term).toBeVisible();
    expect(health).toBeVisible();
    expect(term).toHaveTextContent(/You told us there is no cover here today/);
  });
});
