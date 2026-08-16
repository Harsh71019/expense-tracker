import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CashflowForecastRoute from "./page";

const mocks = vi.hoisted(() => ({ getCashflowForecasts: vi.fn() }));
vi.mock("@/features/cashflow-forecast/server/get-cashflow-forecasts", () => ({
  getCashflowForecasts: mocks.getCashflowForecasts
}));
vi.mock("@/features/cashflow-forecast/components/cashflow-forecast-page", () => ({
  CashflowForecastPage: ({ selectedDays }: Readonly<{ selectedDays: number }>) => (
    <p>Selected {selectedDays}</p>
  )
}));

describe("CashflowForecastRoute", () => {
  it("accepts only 30, 60, and 90-day URL selections and defaults safely to 30", async () => {
    mocks.getCashflowForecasts.mockResolvedValue({
      thirtyDay: null,
      sixtyDay: null,
      ninetyDay: null
    });
    render(await CashflowForecastRoute({ searchParams: Promise.resolve({ days: "90" }) }));
    expect(screen.getByText("Selected 90")).toBeVisible();

    render(await CashflowForecastRoute({ searchParams: Promise.resolve({ days: "unsupported" }) }));
    expect(screen.getByText("Selected 30")).toBeVisible();
  });
});
