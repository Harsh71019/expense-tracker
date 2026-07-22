import { render, screen } from "@testing-library/react";
import type { NetWorth } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { NetWorthHero } from "./net-worth-hero";

const netWorth: NetWorth = {
  asOf: new Date("2026-07-18T00:00:00.000Z"),
  netWorthMinor: 1_500_000,
  accounts: [
    { accountId: "507f1f77bcf86cd799439011", name: "HDFC Savings", balanceMinor: 500_000 }
  ],
  assets: [
    {
      assetId: "507f1f77bcf86cd799439021",
      name: "HDFC FD",
      kind: "fixed_deposit",
      valueMinor: 1_200_000,
      valuedAt: new Date("2026-07-01T00:00:00.000Z")
    },
    {
      assetId: "507f1f77bcf86cd799439022",
      name: "Car loan",
      kind: "loan_liability",
      valueMinor: -200_000,
      valuedAt: new Date("2026-07-01T00:00:00.000Z")
    }
  ]
};

describe("NetWorthHero", () => {
  it("shows the total net worth and the assets/liabilities breakdown", () => {
    render(<NetWorthHero netWorth={netWorth} />);

    expect(screen.getByText("TOTAL NET WORTH")).toBeVisible();
    expect(screen.getByText("ASSETS")).toBeVisible();
    expect(screen.getByText("LIABILITIES")).toBeVisible();
    expect(screen.getByText("1 open")).toBeVisible();
    expect(screen.getByText("1 loans owed")).toBeVisible();
  });
});
