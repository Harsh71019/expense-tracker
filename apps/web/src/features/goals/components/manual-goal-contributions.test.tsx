import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GoalContribution } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ManualGoalContributions } from "./manual-goal-contributions";

const sampleContributions: GoalContribution[] = [
  {
    id: "3fa85f64-5717-4562-b3fc-2c963f66c001",
    userId: "user-1",
    goalId: "g-1",
    type: "deposit",
    amountMinor: 5000_00,
    note: "Initial savings",
    occurredAt: new Date("2026-01-15T00:00:00.000Z"),
    createdAt: new Date("2026-01-15T00:00:00.000Z")
  },
  {
    id: "3fa85f64-5717-4562-b3fc-2c963f66c002",
    userId: "user-1",
    goalId: "g-1",
    type: "withdrawal",
    amountMinor: 1000_00,
    note: "Small cash spend",
    occurredAt: new Date("2026-01-20T00:00:00.000Z"),
    createdAt: new Date("2026-01-20T00:00:00.000Z")
  }
];

vi.mock("../hooks/use-goals", () => ({
  useGoalContributions: (_goalId: string, initialData: GoalContribution[]) => ({
    data: initialData,
    isLoading: false
  })
}));

describe("ManualGoalContributions", () => {
  it("renders contribution history items with badges", () => {
    const onAddDeposit = vi.fn();
    const onAddWithdrawal = vi.fn();

    render(
      <ManualGoalContributions
        goalId="g-1"
        initialContributions={sampleContributions}
        onAddDeposit={onAddDeposit}
        onAddWithdrawal={onAddWithdrawal}
      />
    );

    expect(screen.getByText("Initial savings")).toBeVisible();
    expect(screen.getByText("Small cash spend")).toBeVisible();
    expect(screen.getByText("Deposit")).toBeVisible();
    expect(screen.getByText("Withdrawal")).toBeVisible();
  });

  it("calls action callbacks on button clicks", async () => {
    const user = userEvent.setup();
    const onAddDeposit = vi.fn();
    const onAddWithdrawal = vi.fn();

    render(
      <ManualGoalContributions
        goalId="g-1"
        initialContributions={[]}
        onAddDeposit={onAddDeposit}
        onAddWithdrawal={onAddWithdrawal}
      />
    );

    expect(screen.getByText("No contributions recorded yet")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "+ Deposit" }));
    expect(onAddDeposit).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "− Withdraw" }));
    expect(onAddWithdrawal).toHaveBeenCalled();
  });
});
