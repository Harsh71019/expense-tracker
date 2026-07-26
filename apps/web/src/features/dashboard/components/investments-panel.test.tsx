import { render, screen } from "@testing-library/react";
import type { DashboardInvestments } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { InvestmentsPanel } from "./investments-panel";

const investments: DashboardInvestments = {
  items: [
    {
      assetId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
      name: "Nifty 50 Index",
      kind: "investment",
      currentValueMinor: 4_230_000_00,
      returnPct: 18.4,
      series: [
        { valuedAt: new Date("2026-06-01T00:00:00.000Z"), valueMinor: 4_000_000_00 },
        { valuedAt: new Date("2026-07-01T00:00:00.000Z"), valueMinor: 4_230_000_00 }
      ]
    },
    {
      assetId: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
      name: "HDFC FD 2025",
      kind: "fixed_deposit",
      currentValueMinor: 518_100_00,
      returnPct: null,
      series: []
    }
  ]
};

describe("InvestmentsPanel", () => {
  it("renders each investment with its kind label and return", () => {
    render(<InvestmentsPanel investments={investments} />);

    expect(screen.getByText("Nifty 50 Index")).toBeVisible();
    expect(screen.getByText("Investment")).toBeVisible();
    expect(screen.getByText("+18.4%")).toBeVisible();
    expect(screen.getByText("HDFC FD 2025")).toBeVisible();
    expect(screen.getByText("FD")).toBeVisible();
  });

  it("shows an empty state when there are no investments", () => {
    render(<InvestmentsPanel investments={{ items: [] }} />);
    expect(screen.getByText("No investments or deposits tracked yet.")).toBeVisible();
  });
});
