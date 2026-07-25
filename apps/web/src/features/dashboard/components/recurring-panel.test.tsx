import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecurringForecast } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { RecurringPanel } from "./recurring-panel";

const mocks = vi.hoisted(() => ({ useRecurringForecast: vi.fn() }));
vi.mock("../hooks/use-recurring-forecast", () => ({
  useRecurringForecast: mocks.useRecurringForecast
}));

const forecast: RecurringForecast = {
  range: "1M",
  inMinor: 850_000_00,
  outMinor: 500_000_00,
  netMinor: 350_000_00,
  upcoming: [
    {
      ruleId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      name: "Netflix",
      type: "expense",
      amountMinor: 649_00,
      nextRunAt: new Date("2026-08-09T00:00:00.000Z")
    },
    {
      ruleId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
      name: "Salary",
      type: "income",
      amountMinor: 8_500_000_00,
      nextRunAt: new Date("2026-08-28T00:00:00.000Z")
    }
  ]
};

describe("RecurringPanel", () => {
  it("renders the net figure and every upcoming item", () => {
    mocks.useRecurringForecast.mockReturnValue({ data: undefined });
    render(<RecurringPanel initialForecast={forecast} initialRange="1M" />);

    expect(screen.getByText("Netflix")).toBeVisible();
    expect(screen.getByText("Salary")).toBeVisible();
    expect(screen.getByText("Income")).toBeVisible();
    expect(screen.getByText("Expense")).toBeVisible();
  });

  it("shows a message when nothing is scheduled", () => {
    mocks.useRecurringForecast.mockReturnValue({ data: undefined });
    render(<RecurringPanel initialForecast={{ ...forecast, upcoming: [] }} initialRange="1M" />);

    expect(screen.getByText("Nothing scheduled.")).toBeVisible();
  });

  it("switches ranges on tab click", async () => {
    const user = userEvent.setup();
    mocks.useRecurringForecast.mockReturnValue({ data: undefined });
    render(<RecurringPanel initialForecast={forecast} initialRange="1M" />);

    await user.click(screen.getByRole("button", { name: "6M" }));
    expect(mocks.useRecurringForecast).toHaveBeenLastCalledWith("6M", undefined);
  });
});
