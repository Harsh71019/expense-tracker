import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DeleteRuleDialog } from "./delete-rule-dialog";

const rule: CategoryRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be21",
  userId: "u1",
  pattern: "swiggy",
  categoryId: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  createdAt: new Date("2026-05-02T12:10:00.000Z"),
  updatedAt: new Date("2026-05-02T12:10:00.000Z")
};

const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Restaurants",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("DeleteRuleDialog", () => {
  it("renders the confirmation message and confirms deletion", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteRuleDialog
        rule={rule}
        category={category}
        isPending={false}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("Delete automation rule?")).toBeVisible();
    expect(screen.getByText(/"swiggy"/)).toBeVisible();
    expect(screen.getByText("Restaurants")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("cancels when clicking Cancel button", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <DeleteRuleDialog
        rule={rule}
        category={category}
        isPending={false}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
