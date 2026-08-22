import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { CategoryPicker } from "./category-picker";

const groceries: Category = {
  id: "123e4567-e89b-42d3-a456-426614174001",
  userId: "user-1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};
const dining: Category = {
  ...groceries,
  id: "123e4567-e89b-42d3-a456-426614174002",
  name: "Dining",
  parentId: groceries.id
};

const mocks = vi.hoisted(() => ({
  showRecommendations: false,
  fetching: false,
  error: false,
  groceriesId: "123e4567-e89b-42d3-a456-426614174001"
}));

vi.mock("../../hooks/use-category-recommendations", () => ({
  useCategoryRecommendations: () => ({
    data: mocks.showRecommendations
      ? {
          items: [
            {
              categoryId: mocks.groceriesId,
              reason: "frequent",
              evidenceCount: 4,
              algorithmVersion: 2
            }
          ],
          computedAt: new Date("2026-08-22T06:30:00.000Z"),
          sourceThrough: new Date("2026-08-01T06:30:00.000Z"),
          algorithmVersion: 2,
          historyRowsConsidered: 4,
          degraded: false
        }
      : undefined,
    isFetching: mocks.fetching,
    isError: mocks.error
  })
}));

function renderPicker(
  props: Partial<Parameters<typeof CategoryPicker>[0]> = {}
): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = props.onChange ?? vi.fn();
  return render(
    <QueryClientProvider client={client}>
      <CategoryPicker
        categories={[groceries, dining]}
        type="expense"
        value={props.value}
        onChange={onChange}
        occurredAt={new Date("2026-08-22T06:30:00.000Z")}
        {...props}
      />
    </QueryClientProvider>
  );
}

describe("CategoryPicker", () => {
  it("selects from the full list and from a recommendation without auto-assigning", async () => {
    mocks.showRecommendations = true;
    mocks.fetching = false;
    mocks.error = false;
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ onChange });

    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("option", { name: "Groceries, Used in 4 prior entries" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(groceries.id);
  });

  it("filters recommendations and the full list from local search", async () => {
    mocks.showRecommendations = true;
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    await user.type(screen.getByLabelText("Search categories"), "din");
    expect(screen.getByRole("option", { name: "Dining" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Groceries" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Groceries, Used in 4 prior entries" })
    ).not.toBeInTheDocument();
  });

  it("keeps the full list usable when recommendations fail", async () => {
    mocks.showRecommendations = false;
    mocks.error = true;
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ onChange });
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(screen.queryByText("Recommended for you")).not.toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Dining" }));
    expect(onChange).toHaveBeenCalledWith(dining.id);
  });

  it("moves with keyboard and restores focus to the trigger on Escape", async () => {
    mocks.showRecommendations = false;
    mocks.error = false;
    const user = userEvent.setup();
    renderPicker();
    const trigger = screen.getByRole("combobox", { name: "Category" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
