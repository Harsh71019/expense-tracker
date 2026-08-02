import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { BudgetForm } from "./budget-form";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn()
}));

vi.mock("../hooks/use-budget-mutations", () => ({
  useUpsertBudget: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false
  })
}));

const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  userId: "user-1",
  name: "Groceries",
  kind: "expense",
  icon: "shopping-cart",
  color: "#f97316",
  isArchived: false,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

describe("BudgetForm", () => {
  it("submits the current input draft without requiring a prior blur", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    mocks.mutateAsync.mockResolvedValue({});

    render(<BudgetForm categories={[category]} budgets={[]} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByRole("dialog", { name: "Add budget" })).toHaveClass(
      "max-h-[92dvh]",
      "sm:h-dvh"
    );
    expect(screen.getByRole("button", { name: "Close budget form" })).toHaveClass("h-11", "w-11");

    await user.click(screen.getByRole("combobox", { name: "Expense category" }));
    await user.click(screen.getByRole("option", { name: "Groceries" }));
    const amount = screen.getByLabelText("Monthly limit");
    await user.clear(amount);
    await user.type(amount, "2500.50");
    await user.click(screen.getByRole("button", { name: "Add budget" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      categoryId: category.id,
      input: { limitMinor: 250_050 }
    });
    expect(onSaved).toHaveBeenCalledWith("Groceries created.");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps an invalid value in the form and shows an inline error", async () => {
    const user = userEvent.setup();
    render(<BudgetForm categories={[category]} budgets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Expense category" }));
    await user.click(screen.getByRole("option", { name: "Groceries" }));
    const amount = screen.getByLabelText("Monthly limit");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByRole("button", { name: "Add budget" }));

    expect(screen.getByText("Monthly limit must be greater than zero.")).toBeVisible();
    expect(amount).toHaveValue("0");
  });
});
