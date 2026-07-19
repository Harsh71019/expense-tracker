import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { ArchiveCategoryDialog } from "./archive-category-dialog";

const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Food & Dining",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-08T09:24:00.000Z"),
  updatedAt: new Date("2026-01-08T09:24:00.000Z")
};

describe("ArchiveCategoryDialog", () => {
  it("confirms archiving via the callback", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ArchiveCategoryDialog
        category={category}
        hasChildren={false}
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Archive Food & Dining?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Archive category" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("warns when the category has subcategories", () => {
    render(
      <ArchiveCategoryDialog
        category={category}
        hasChildren
        isPending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText(/This is a parent with subcategories/)).toBeVisible();
  });

  it("cancels via the Cancel button and the backdrop, but not the card itself", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ArchiveCategoryDialog
        category={category}
        hasChildren={false}
        isPending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByText(/can't be undone/));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending", () => {
    render(
      <ArchiveCategoryDialog
        category={category}
        hasChildren={false}
        isPending
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Archiving…" })).toBeDisabled();
  });
});
