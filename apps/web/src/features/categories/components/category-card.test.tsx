import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryCard } from "./category-card";

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

describe("CategoryCard", () => {
  it("shows the top-level label and lets the parent be archived", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const parent = category();
    render(<CategoryCard parent={parent} subcategories={[]} onArchive={onArchive} />);

    expect(screen.getByText("Food & Dining")).toBeVisible();
    expect(screen.getByText("Top-level category")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Archive Food & Dining" }));
    expect(onArchive).toHaveBeenCalledWith(parent);
  });

  it("lists subcategories as pills and archives a child independently", async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    const parent = category();
    const child = category({
      id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
      name: "Groceries",
      parentId: parent.id
    });
    render(<CategoryCard parent={parent} subcategories={[child]} onArchive={onArchive} />);

    expect(screen.getByText("1 subcategory")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Groceries/ }));
    expect(onArchive).toHaveBeenCalledWith(child);
  });

  it("pluralises the subcategory count", () => {
    const parent = category();
    const children = [
      category({
        id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
        name: "Groceries",
        parentId: parent.id
      }),
      category({
        id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
        name: "Restaurants",
        parentId: parent.id
      })
    ];
    render(<CategoryCard parent={parent} subcategories={children} onArchive={vi.fn()} />);

    expect(screen.getByText("2 subcategories")).toBeVisible();
  });
});
