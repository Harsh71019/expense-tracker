import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
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
    const { container } = render(
      <CategoryCard parent={parent} subcategories={[]} onArchive={onArchive} />
    );

    expect(screen.getByText("Food & Dining")).toBeVisible();
    expect(screen.getByText("Top-level category")).toBeVisible();
    expect(container.firstElementChild).toHaveClass("overflow-visible");

    await user.click(screen.getByRole("button", { name: "Actions for Food & Dining" }));
    expect(screen.getByLabelText("Actions for Food & Dining", { selector: "div" })).toHaveClass(
      "z-50"
    );
    await user.click(screen.getByRole("button", { name: /archive/i }));
    expect(onArchive).toHaveBeenCalledWith(parent);
  });

  it("lists subcategories and archives a child independently", async () => {
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
    await user.click(screen.getByRole("button", { name: "Actions for Groceries" }));
    await user.click(screen.getByRole("button", { name: /archive/i }));
    expect(onArchive).toHaveBeenCalledWith(child);
  });

  it("pluralises the subcategory count and displays spending stats", () => {
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
    render(
      <CategoryCard
        parent={parent}
        subcategories={children}
        stats={{ spentMinor: 15_000_00, incomeMinor: 0, txnCount: 5 }}
        onArchive={vi.fn()}
      />
    );

    expect(screen.getByText("2 subcategories")).toBeVisible();
    expect(screen.getByText(/₹15,000.00 spent/)).toBeVisible();
    expect(screen.getByText(/\(5 txns\)/)).toBeVisible();
  });

  it("triggers group update on group button click", async () => {
    const user = userEvent.setup();
    const onUpdateGroup = vi.fn();
    const parent = category({ group: "essential" });
    render(
      <CategoryCard
        parent={parent}
        subcategories={[]}
        onArchive={vi.fn()}
        onUpdateGroup={onUpdateGroup}
      />
    );

    expect(screen.getByText("Essential · Needs")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /50\/30\/20 Group/ }));
    await user.click(screen.getByRole("button", { name: "Lifestyle (Wants)" }));
    expect(onUpdateGroup).toHaveBeenCalledWith(parent, "lifestyle");
  });
});
