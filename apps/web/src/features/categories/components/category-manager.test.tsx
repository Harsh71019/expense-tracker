import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@vyaya/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CategoryManager } from "./category-manager";

const mocks = vi.hoisted(() => {
  const categories: Category[] = [];
  return {
    categories,
    createMutateAsync: vi.fn(),
    createPending: false,
    archiveMutateAsync: vi.fn(),
    archivePending: false
  };
});

vi.mock("../hooks/use-categories", () => ({
  useCategories: () => ({ data: mocks.categories })
}));

vi.mock("../hooks/use-category-mutations", () => ({
  useCreateCategory: () => ({
    mutateAsync: mocks.createMutateAsync,
    isPending: mocks.createPending
  }),
  useArchiveCategory: () => ({
    mutateAsync: mocks.archiveMutateAsync,
    isPending: mocks.archivePending
  })
}));

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "u1",
    name: "Food & Dining",
    kind: "expense",
    isArchived: false,
    createdAt: new Date("2026-01-08T09:24:00.000Z"),
    updatedAt: new Date("2026-01-08T09:24:00.000Z"),
    ...overrides
  };
}

describe("CategoryManager", () => {
  beforeEach(() => {
    mocks.categories = [];
    mocks.createPending = false;
    mocks.archivePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.archiveMutateAsync.mockReset();
  });

  it("shows an empty state for the active kind when there are no categories", () => {
    render(<CategoryManager initialCategories={[]} />);
    expect(screen.getByText("No expense categories yet")).toBeVisible();
  });

  it("groups categories by kind under parent cards and hides archived ones", async () => {
    const user = userEvent.setup();
    mocks.categories = [
      category(),
      category({ id: "3fa85f64-5717-4562-b3fc-2c963f66beff", name: "Old", isArchived: true }),
      category({
        id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
        name: "Salary",
        kind: "income"
      })
    ];
    render(<CategoryManager initialCategories={mocks.categories} />);

    expect(screen.getByText("Food & Dining")).toBeVisible();
    expect(screen.queryByText("Old")).not.toBeInTheDocument();
    expect(screen.queryByText("Salary")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Income/ }));
    expect(screen.getByText("Salary")).toBeVisible();
    expect(screen.queryByText("Food & Dining")).not.toBeInTheDocument();
  });

  it("opens the create sheet and archives a category through the confirm dialog", async () => {
    const user = userEvent.setup();
    mocks.archiveMutateAsync.mockResolvedValue(undefined);
    const parent = category();
    mocks.categories = [parent];
    render(<CategoryManager initialCategories={mocks.categories} />);

    await user.click(screen.getByRole("button", { name: /New category/ }));
    expect(screen.getByRole("dialog", { name: "New category" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Archive Food & Dining" }));
    expect(screen.getByText("Archive Food & Dining?")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Archive category" }));
    expect(mocks.archiveMutateAsync).toHaveBeenCalledWith(parent.id);
  });
});
