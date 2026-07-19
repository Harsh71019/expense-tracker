import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category, CategoryRule } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { RuleRow } from "./rule-row";

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
  icon: "🍜",
  color: "#ec4899",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("RuleRow", () => {
  it("shows the pattern and the resolved category, and requests deletion", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<RuleRow rule={rule} category={category} onDelete={onDelete} />);

    expect(screen.getByText('"swiggy"')).toBeVisible();
    expect(screen.getByText("Restaurants")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(rule);
  });

  it("falls back to a placeholder when the category is unavailable", () => {
    render(<RuleRow rule={rule} category={undefined} onDelete={vi.fn()} />);
    expect(screen.getByText("Unavailable category")).toBeVisible();
  });
});
