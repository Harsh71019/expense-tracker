import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountBalanceChart } from "./account-balance-chart";
import { AccountCashflowChart } from "./account-cashflow-chart";
import { AccountSpendingBreakdown } from "./account-spending-breakdown";

describe("account detail charts", () => {
  it("renders accessible balance and cashflow graphics with data tables", () => {
    render(
      <>
        <AccountBalanceChart
          points={[
            { period: "2026-08-01", balanceMinor: -5_000 },
            { period: "2026-08-02", balanceMinor: 20_000 }
          ]}
        />
        <AccountCashflowChart
          points={[
            { period: "2026-08-01", incomeMinor: 0, expenseMinor: 5_000 },
            { period: "2026-08-02", incomeMinor: 25_000, expenseMinor: 0 }
          ]}
        />
      </>
    );

    expect(screen.getByRole("img", { name: /Running account balance/ })).toBeVisible();
    expect(screen.getByRole("img", { name: /Income and expenses/ })).toBeVisible();
    expect(screen.getByText("Running account balance by period")).toBeInTheDocument();
    expect(screen.getByText("Account money in and money out by period")).toBeInTheDocument();
  });

  it("renders category shares and a directed empty state", () => {
    const { rerender } = render(
      <AccountSpendingBreakdown
        items={[
          {
            categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
            name: "Food",
            color: "#16A34A",
            amountMinor: 25_000,
            transactionCount: 2
          }
        ]}
      />
    );
    expect(screen.getByText("Food")).toBeVisible();
    expect(screen.getByText(/100%/)).toBeVisible();

    rerender(<AccountSpendingBreakdown items={[]} />);
    expect(screen.getByText("No categorized spending")).toBeVisible();
  });
});
