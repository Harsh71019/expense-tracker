import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Goal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { GoalContributionDrawer } from "./goal-contribution-drawer";

const mutations = vi.hoisted(() => ({
  recordContribution: { isPending: false, mutateAsync: vi.fn() }
}));

vi.mock("../hooks/use-goals", () => ({
  useRecordGoalContribution: () => mutations.recordContribution
}));

const mockGoal: Goal = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Cash Sinking Fund",
  targetMinor: 50_000_00,
  fundingMode: "manual_envelope",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 10_000_00,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("GoalContributionDrawer", () => {
  it("submits a deposit contribution", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mutations.recordContribution.mutateAsync.mockResolvedValueOnce({
      ...mockGoal,
      progressMinor: 15_000_00
    });

    render(<GoalContributionDrawer goal={mockGoal} defaultType="deposit" onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Add to goal" })).toBeVisible();

    const amount = screen.getByLabelText("Deposit amount");
    await user.clear(amount);
    await user.type(amount, "5000");
    await user.tab();

    const note = screen.getByLabelText("Note (optional)");
    await user.type(note, "Bonus cash savings");

    await user.click(screen.getByRole("button", { name: "Record deposit" }));

    expect(mutations.recordContribution.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: mockGoal.id,
        input: expect.objectContaining({
          type: "deposit",
          amountMinor: 5000_00,
          note: "Bonus cash savings"
        })
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("switches to withdrawal and submits", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mutations.recordContribution.mutateAsync.mockResolvedValueOnce({
      ...mockGoal,
      progressMinor: 8_000_00
    });

    render(<GoalContributionDrawer goal={mockGoal} defaultType="withdrawal" onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "Withdraw from goal" })).toBeVisible();

    const amount = screen.getByLabelText("Withdrawal amount");
    await user.clear(amount);
    await user.type(amount, "2000");
    await user.tab();

    await user.click(screen.getByRole("button", { name: "Record withdrawal" }));

    expect(mutations.recordContribution.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: mockGoal.id,
        input: expect.objectContaining({
          type: "withdrawal",
          amountMinor: 2000_00
        })
      })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
