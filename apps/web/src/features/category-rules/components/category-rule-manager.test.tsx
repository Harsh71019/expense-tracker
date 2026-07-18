import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryRule } from "@vyaya/shared";
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
    toastError: vi.fn()
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

vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

const groceries: Category = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const bigbasketRule: CategoryRule = {
  id: "507f1f77bcf86cd799439021",
  userId: "u1",
  pattern: "bigbasket",
  categoryId: groceries.id,
  createdAt: new Date("2026-05-04T19:30:00.000Z"),
  updatedAt: new Date("2026-05-04T19:30:00.000Z")
};

describe("CategoryRuleManager", () => {
  beforeEach(() => {
    mocks.rules = [];
    mocks.categories = [groceries];
    mocks.createPending = false;
    mocks.deletePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows the zero state when there are no rules", () => {
    render(<CategoryRuleManager initialRules={[]} />);
    expect(screen.getByText("No rules yet")).toBeVisible();
    expect(screen.getByText("0 rules")).toBeVisible();
  });

  it("lists existing rules and deletes one without confirmation", async () => {
    const user = userEvent.setup();
    mocks.rules = [bigbasketRule];
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    render(<CategoryRuleManager initialRules={mocks.rules} />);

    expect(screen.getByText("1 rule")).toBeVisible();
    expect(screen.getByText('"bigbasket"')).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith(bigbasketRule.id);
  });

  it("creates a rule from the inline row and clears the fields", async () => {
    const user = userEvent.setup();
    mocks.createMutateAsync.mockResolvedValue({});
    render(<CategoryRuleManager initialRules={[]} />);

    await user.type(screen.getByLabelText("New rule pattern"), "netflix");
    await user.selectOptions(screen.getByLabelText("Category to assign"), groceries.id);
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(mocks.createMutateAsync).toHaveBeenCalledWith({
      pattern: "netflix",
      categoryId: groceries.id
    });
  });

  it("shows a toast when the pattern is empty", async () => {
    const user = userEvent.setup();
    render(<CategoryRuleManager initialRules={[]} />);

    await user.selectOptions(screen.getByLabelText("Category to assign"), groceries.id);
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.createMutateAsync).not.toHaveBeenCalled();
  });
});
