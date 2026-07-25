import { render, screen } from "@testing-library/react";
import type { Goal } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { GoalCard } from "./goal-card";

const goal: Goal = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Emergency fund",
  targetMinor: 100_000,
  fundingMode: "linked_account",
  linkedAccountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  priority: 0,
  status: "active",
  startedMinor: 0,
  progressMinor: 25_000,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("GoalCard", () => {
  it("links to detail and exposes progress and reorder state", () => {
    render(
      <GoalCard
        goal={goal}
        plan={undefined}
        accountName="Savings"
        canMoveUp={false}
        canMoveDown
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onAbandon={vi.fn()}
      />
    );

    expect(screen.getByRole("link", { name: "Emergency fund" })).toHaveAttribute(
      "href",
      `/goals/${goal.id}`
    );
    expect(screen.getByRole("img", { name: "25% funded" })).toBeVisible();
    expect(screen.getByText("Savings")).toBeVisible();
    expect(screen.getByRole("button", { name: "Move Emergency fund up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Emergency fund down" })).toBeEnabled();
  });

  it("renders the abandoned terminal state without reorder actions", () => {
    render(
      <GoalCard goal={{ ...goal, status: "abandoned" }} plan={undefined} accountName="Savings" />
    );

    expect(screen.getByText("Abandoned")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Move Emergency fund/ })).toBeNull();
  });
});
