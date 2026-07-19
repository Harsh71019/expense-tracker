import { render, screen } from "@testing-library/react";
import type { Account, MonthlyRollup } from "@vyaya/shared";
import { describe, expect, it } from "vitest";

import { AccountFlowPanel } from "./account-flow-panel";

const hdfc: Account = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "HDFC Bank",
  type: "bank",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: 0,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const rollup: MonthlyRollup = {
  userId: "u1",
  month: "2026-06",
  byCategory: [],
  byAccount: [
    { accountId: hdfc.id, netMinor: 165_750 },
    { accountId: "507f1f77bcf86cd799439099", netMinor: -50_000 }
  ],
  totalExpenseMinor: 0,
  totalIncomeMinor: 0,
  computedAt: new Date("2026-07-01T02:15:00.000Z")
};

describe("AccountFlowPanel", () => {
  it("resolves account names and shows a signed net flow per account", () => {
    render(<AccountFlowPanel rollup={rollup} accounts={[hdfc]} />);

    expect(screen.getByText("HDFC Bank")).toBeVisible();
    expect(screen.getByText("+₹1,657.50")).toBeVisible();
    expect(screen.getByText("Unavailable account")).toBeVisible();
    expect(screen.getByText("−₹500.00")).toBeVisible();
  });
});
