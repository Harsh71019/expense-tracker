import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@/lib/errors";

import { CategoryManager } from "./category-manager";

const mocks = vi.hoisted(() => {
  const categories: Category[] = [];
  return {
    categories,
    createMutateAsync: vi.fn(),
    createPending: false,
    archiveMutateAsync: vi.fn(),
    archivePending: false,
    updateMutateAsync: vi.fn(),
    unarchiveMutateAsync: vi.fn(),
    unarchivePending: false,
    deleteMutateAsync: vi.fn(),
    deletePending: false,
    toastSuccess: vi.fn(),
    toastError: vi.fn()
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
  }),
  useUpdateCategory: () => ({ mutateAsync: mocks.updateMutateAsync, isPending: false }),
  useUnarchiveCategory: () => ({
    mutateAsync: mocks.unarchiveMutateAsync,
    isPending: mocks.unarchivePending
  }),
  usePermanentlyDeleteCategory: () => ({
    mutateAsync: mocks.deleteMutateAsync,
    isPending: mocks.deletePending
  })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
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
    mocks.unarchivePending = false;
    mocks.deletePending = false;
    mocks.createMutateAsync.mockReset();
    mocks.archiveMutateAsync.mockReset();
    mocks.updateMutateAsync.mockReset();
    mocks.unarchiveMutateAsync.mockReset();
    mocks.deleteMutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
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
    const dialog = screen.getByRole("dialog", { name: "New category" });
    expect(dialog).toBeVisible();
    expect(dialog).toHaveClass("max-h-[92dvh]", "sm:h-dvh");
    const closeButton = screen.getByRole("button", { name: "Close category form" });
    expect(closeButton).toHaveClass("h-11", "w-11");
    await user.click(closeButton);

    await user.click(screen.getByRole("button", { name: "Actions for Food & Dining" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("Archive Food & Dining?")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Archive category" }));
    expect(mocks.archiveMutateAsync).toHaveBeenCalledWith(parent.id);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Category archived");
  });

  it("shows archived categories with restore and permanent-delete actions", async () => {
    const user = userEvent.setup();
    const archived = category({ isArchived: true });
    mocks.categories = [archived];
    mocks.unarchiveMutateAsync.mockResolvedValue({ ...archived, isArchived: false });
    mocks.deleteMutateAsync.mockResolvedValue(undefined);
    render(<CategoryManager initialCategories={mocks.categories} />);

    await user.click(screen.getByRole("button", { name: /Archived/ }));
    expect(screen.getByText("Food & Dining")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(mocks.unarchiveMutateAsync).toHaveBeenCalledWith(archived.id);

    await user.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete permanently" }));
    expect(mocks.deleteMutateAsync).toHaveBeenCalledWith(archived.id);
  });

  it("opens quick rename on an unarchive name collision and restores after saving", async () => {
    const user = userEvent.setup();
    const archived = category({ isArchived: true });
    const renamed = { ...archived, name: "Food & Dining (old)" };
    mocks.categories = [archived];
    mocks.unarchiveMutateAsync
      .mockRejectedValueOnce(
        new ConflictError("An active sibling category already uses this name.", {
          status: 409,
          problemType: "category.name_conflict"
        })
      )
      .mockResolvedValueOnce({ ...renamed, isArchived: false });
    mocks.updateMutateAsync.mockResolvedValue(renamed);
    render(<CategoryManager initialCategories={mocks.categories} />);

    await user.click(screen.getByRole("button", { name: /Archived/ }));
    await user.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(await screen.findByRole("dialog", { name: "Rename to restore" })).toBeVisible();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), renamed.name);
    await user.click(screen.getByRole("button", { name: "Save and unarchive" }));

    expect(mocks.updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: archived.id })
    );
    expect(mocks.unarchiveMutateAsync).toHaveBeenCalledTimes(2);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Category renamed and unarchived");
  });

  it("filters categories in real time based on search query", async () => {
    const user = userEvent.setup();
    mocks.categories = [
      category({ id: "cat-1", name: "Food & Dining" }),
      category({ id: "cat-2", name: "Transportation" })
    ];
    render(<CategoryManager initialCategories={mocks.categories} />);

    expect(screen.getByText("Food & Dining")).toBeVisible();
    expect(screen.getByText("Transportation")).toBeVisible();

    await user.type(screen.getByLabelText("Search categories"), "Food");
    expect(screen.getByText("Food & Dining")).toBeVisible();
    expect(screen.queryByText("Transportation")).not.toBeInTheDocument();
  });
});
