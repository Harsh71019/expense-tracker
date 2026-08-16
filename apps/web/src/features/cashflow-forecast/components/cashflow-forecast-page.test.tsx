import { render, screen } from "@testing-library/react";
import {
  CashflowForecastSnapshotSchema,
  type CashflowForecastSnapshot
} from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { CashflowForecastPage } from "./cashflow-forecast-page";

function snapshot(overrides: Record<string, unknown> = {}): CashflowForecastSnapshot {
  return CashflowForecastSnapshotSchema.parse({
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    asOf: "2026-08-16T00:00:00.000Z",
    horizonDays: 30,
    modelVersion: 1,
    inputWatermark: {
      asOf: "2026-08-16T00:00:00.000Z",
      latestOccurredAt: "2026-08-15T00:00:00.000Z",
      latestUpdatedAt: "2026-08-15T00:00:00.000Z",
      rowCount: 60,
      digest: "a".repeat(64)
    },
    sufficiency: { status: "sufficient", observationCount: 60, minimumRequired: 35 },
    resources: {
      rowsScanned: 60,
      runtimeMs: 3,
      rowBudgetHit: false,
      timedOut: false,
      outcome: { status: "completed" }
    },
    model: "trailing_median",
    pointBalanceMinor: 12_500,
    range: {
      lowerMinor: 8_000,
      upperMinor: 15_000,
      observedCoverageBps: 8_500,
      label: "historical_range"
    },
    assumptions: {
      liquidBalanceMinor: 10_000,
      knownRecurringInflowMinor: 8_000,
      knownRecurringOutflowMinor: 3_000,
      creditCardBillsDueMinor: 1_500,
      excludedCreditCardPurchaseCount: 1,
      excludedTransferCount: 1,
      variableSpendExcludedRecurringCount: 2,
      asOfDeterministic: true
    },
    metrics: {
      evaluatedOriginCount: 8,
      maeMinor: 500,
      maseBps: null,
      baselineMaeMinor: null,
      residualCount: 8,
      observedCoverageBps: 8_500,
      eligibleForHorizon: true
    },
    shortfall: {
      hasPotentialShortfall: false,
      firstPotentialShortfallDate: null,
      conservativeBalanceMinor: 8_000,
      mode: "read_only"
    },
    computedAt: "2026-08-16T01:00:00.000Z",
    ...overrides
  });
}

describe("CashflowForecastPage", () => {
  it("presents a sufficient 30-day snapshot with its range and component evidence", () => {
    render(
      <CashflowForecastPage
        selectedDays={30}
        forecasts={{ thirtyDay: snapshot(), sixtyDay: null, ninetyDay: null }}
      />
    );

    expect(screen.getByRole("heading", { name: "Cash-flow forecast" })).toBeVisible();
    expect(screen.getByText("Historical range")).toBeVisible();
    expect(screen.getByText("Liquid cash today")).toBeVisible();
    expect(screen.getByText(/Excludes investment balances and available credit/)).toBeVisible();
    expect(screen.getByRole("link", { name: "30 days" })).toHaveAttribute(
      "href",
      "/cash-flow?days=30"
    );
    expect(screen.queryByRole("link", { name: "60 days" })).not.toBeInTheDocument();
  });

  it("only shows longer horizons that have empirical eligibility and coverage", () => {
    const eligibleSixty = snapshot({ horizonDays: 60 });
    const ineligibleNinety = snapshot({
      horizonDays: 90,
      metrics: { ...snapshot().metrics, eligibleForHorizon: false }
    });
    render(
      <CashflowForecastPage
        selectedDays={60}
        forecasts={{ thirtyDay: snapshot(), sixtyDay: eligibleSixty, ninetyDay: ineligibleNinety }}
      />
    );

    expect(screen.getByRole("link", { name: "60 days" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "90 days" })).not.toBeInTheDocument();
    expect(screen.getByText(/Longer horizons remain hidden/)).toBeVisible();
  });

  it("makes insufficient and degraded snapshots explicit", () => {
    const degraded = snapshot({
      sufficiency: {
        status: "insufficient",
        reason: "insufficient_history",
        observationCount: 2,
        minimumRequired: 35
      },
      resources: {
        rowsScanned: 2,
        runtimeMs: 3,
        rowBudgetHit: true,
        timedOut: false,
        outcome: { status: "degraded", reason: "resource_limit" }
      }
    });
    render(
      <CashflowForecastPage
        selectedDays={30}
        forecasts={{ thirtyDay: degraded, sixtyDay: null, ninetyDay: null }}
      />
    );

    expect(screen.getByText(/snapshot is degraded/)).toBeVisible();
    expect(screen.getByText(/Insufficient history/)).toBeVisible();
    expect(screen.getByText(/variable spending is not estimated/)).toBeVisible();
  });

  it("presents a potential shortfall as read-only decision support", () => {
    const atRisk = snapshot({
      shortfall: {
        hasPotentialShortfall: true,
        firstPotentialShortfallDate: "2026-09-15",
        conservativeBalanceMinor: -500,
        mode: "read_only"
      }
    });
    render(
      <CashflowForecastPage
        selectedDays={30}
        forecasts={{ thirtyDay: atRisk, sixtyDay: null, ninetyDay: null }}
      />
    );

    expect(screen.getByRole("heading", { name: "Potential cash shortfall" })).toBeVisible();
    expect(screen.getByText(/read-only decision support/)).toBeVisible();
  });

  it("shows an honest empty state when no snapshot exists", () => {
    render(
      <CashflowForecastPage
        selectedDays={30}
        forecasts={{ thirtyDay: null, sixtyDay: null, ninetyDay: null }}
      />
    );
    expect(screen.getByRole("heading", { name: "Cash-flow forecast is not ready" })).toBeVisible();
  });
});
