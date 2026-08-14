import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryRule } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryRuleManager } from "./category-rule-manager";

const mocks = vi.hoisted(() => {
  const rules: CategoryRule[] = [];
  const categories: Category[] = [];
  return {
    rules,
    categories,
    createMutateAsync: vi.fn(),
    createPending: false,
    deleteMutateAsync: vi.fn(),
    deletePending: false,
    toastError: vi.fn(),
    toastSuccess: vi.fn()
  };
});

vi.mock("../hooks/use-category-rules", () => ({
  useCategoryRules: () => ({ data: mocks.rules }),
  useCreateCategoryRule: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: mocks.createPending
  }),
  useDeleteCategoryRule: () => ({
    mutateAsync: mocks.deleteMutateAsync,
    isPending: mocks.deletePending
  })
}));

vi.mock("@/features/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/categories")>();
  return { ...actual, useCategories: () => ({ data: mocks.categories }) };
});

vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

const groceries: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const salary: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "u1",
  name: "Salary",
  kind: "income",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const bigbasketRule: CategoryRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be21",
  userId: "u1",
  pattern: "bigbasket",
  categoryId: groceries.id,
  createdAt: new Date("2026-05-04T19:30:00.000Z"),
  updatedAt: new Date("2026-05-04T19:30:00.000Z")
};

describe("CategoryRuleManager", () => {
  beforeEach(() => {
    mocks.rules = [];
    mocks.categories = [groceries, salary];
    mocks.createPending = false;
    mocks.deletePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("shows the zero state and coverage stats when there are no rules", () => {
    const { container } = render(<CategoryRuleManager initialRules={[]} />);
    expect(screen.getByText("No rules yet")).toBeVisible();
    expect(screen.getByText("0 rules")).toBeVisible();
    expect(screen.getByText("Active Rules")).toBeVisible();
    expect(screen.getByText("Category Coverage")).toBeVisible();
    expect(container.querySelector("section")).toHaveClass("w-full");
  });

  it("lists existing rules and deletes one with confirmation dialog", async () => {
    const user = userEvent.setup();
    mocks.rules = [bigbasketRule];
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    render(<CategoryRuleManager initialRules={mocks.rules} />);

    expect(screen.getByRole("heading", { name: "1 rule" })).toBeVisible();
    expect(screen.getByText('"bigbasket"')).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete rule containing bigbasket" }));
    expect(screen.getByText("Delete automation rule?")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith(bigbasketRule.id);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Category rule deleted");
  });

  it("creates a rule from the inline row and clears the fields", async () => {
    const user = userEvent.setup();
    mocks.createMutateAsync.mockResolvedValue({});
    render(<CategoryRuleManager initialRules={[]} />);

    await user.type(screen.getByLabelText("New rule pattern"), "netflix");
    await user.click(screen.getByRole("combobox", { name: "Category to assign" }));
    await user.click(screen.getByRole("option", { name: /Groceries/ }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(mocks.createMutateAsync).toHaveBeenCalledWith({
      pattern: "netflix",
      categoryId: groceries.id
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Category rule created");
  });

  it("shows a toast when the pattern is empty", async () => {
    const user = userEvent.setup();
    render(<CategoryRuleManager initialRules={[]} />);

    await user.click(screen.getByRole("combobox", { name: "Category to assign" }));
    await user.click(screen.getByRole("option", { name: /Groceries/ }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });

  it("filters rules by kind when clicking filter pills", async () => {
    const user = userEvent.setup();
    mocks.rules = [
      bigbasketRule,
      {
        id: "rule-salary-1",
        userId: "u1",
        pattern: "salary acme",
        categoryId: salary.id,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        updatedAt: new Date("2026-05-01T00:00:00.000Z")
      }
    ];
    render(<CategoryRuleManager initialRules={mocks.rules} />);

    expect(screen.getByText('"bigbasket"')).toBeVisible();
    expect(screen.getByText('"salary acme"')).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Expense" }));
    expect(screen.getByText('"bigbasket"')).toBeVisible();
    expect(screen.queryByText('"salary acme"')).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Income" }));
    expect(screen.getByText('"salary acme"')).toBeVisible();
    expect(screen.queryByText('"bigbasket"')).not.toBeInTheDocument();
  });

  it("toggles between Grouped and Flat List view modes", async () => {
    const user = userEvent.setup();
    mocks.rules = [bigbasketRule];
    render(<CategoryRuleManager initialRules={mocks.rules} />);

    expect(screen.getByRole("button", { name: "Grouped" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Flat List" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Flat List" }));
    expect(screen.getByText('"bigbasket"')).toBeVisible();
  });
});
