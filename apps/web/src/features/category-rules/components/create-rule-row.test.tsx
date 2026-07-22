import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CreateRuleRow } from "./create-rule-row";

const groceries: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("CreateRuleRow", () => {
  it("reports pattern and category changes and submits on Add rule", async () => {
    const user = userEvent.setup();
    const onPatternChange = vi.fn();
    const onCategoryChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <CreateRuleRow
        categories={[groceries]}
        pattern="bigbasket"
        categoryId=""
        isPending={false}
        onPatternChange={onPatternChange}
        onCategoryChange={onCategoryChange}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText("New rule pattern"), "!");
    expect(onPatternChange).toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Category to assign"), groceries.id);
    expect(onCategoryChange).toHaveBeenCalledWith(groceries.id);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("submits when Enter is pressed in the pattern field", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateRuleRow
        categories={[]}
        pattern="netflix"
        categoryId=""
        isPending={false}
        onPatternChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={onSubmit}
      />
    );

    await user.type(screen.getByLabelText("New rule pattern"), "{Enter}");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("disables Add rule while pending", () => {
    render(
      <CreateRuleRow
        categories={[]}
        pattern=""
        categoryId=""
        isPending
        onPatternChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Adding…" })).toBeDisabled();
  });
});
