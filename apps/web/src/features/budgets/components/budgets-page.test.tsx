import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BudgetPage, Category } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BudgetsPage } from "./budgets-page";

const mocks = vi.hoisted(() => ({
  useBudgets: vi.fn(),
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-budgets", () => ({ useBudgets: mocks.useBudgets }));
vi.mock("../hooks/use-budget-mutations", () => ({
  useArchiveBudget: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false
  }),
  useUpsertBudget: () => ({
    mutateAsync: vi.fn(),
    isPending: false
  })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  userId: "user-1",
  name: "Groceries",
  kind: "expense",
  icon: "shopping-cart",
  color: "#f97316",
  isArchived: false,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

const page: BudgetPage = {
  month: "2026-07",
  computedAt: new Date("2026-07-25T05:00:00.000Z"),
  alertPolicy: { thresholdsBps: [8000, 10_000] },
  overview: {
    plannedMinor: 500_000,
    spentInBudgetedCategoriesMinor: 630_000,
    remainingMinor: -130_000,
    unbudgetedSpentMinor: 50_000,
    activeBudgetCount: 1
  },
  items: [
    {
      budget: {
        id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
        userId: "user-1",
        categoryId: category.id,
        limitMinor: 500_000,
        isArchived: false,
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-01T00:00:00.000Z")
      },
      category: {
        id: category.id,
        name: category.name,
        icon: category.icon ?? null,
        color: category.color ?? null,
        isArchived: false
      },
      spentMinor: 630_000,
      remainingMinor: -130_000,
      utilizationBps: 12_600,
      state: "reached",
      isEffective: true
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
};

function queryResult(data: BudgetPage): object {
  return {
    data: { pages: [data], pageParams: [null] },
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn()
  };
}

describe("BudgetsPage", () => {
  beforeEach(() => {
    mocks.useBudgets.mockReturnValue(queryResult(page));
    mocks.mutateAsync.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows live overview and reached-state content without an alert role", () => {
    render(<BudgetsPage initialPage={page} categories={[category]} />);

    expect(screen.getByRole("heading", { name: "Monthly budgets" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    expect(screen.getByText("Limit reached")).toBeVisible();
    expect(screen.getByText("Over planned amount")).toBeVisible();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirms that archiving leaves transactions unchanged", async () => {
    const user = userEvent.setup();
    render(<BudgetsPage initialPage={page} categories={[category]} />);

    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(screen.getByText(/Transactions are not changed/)).toBeVisible();
  });

  it("offers setup guidance when no budgets exist", () => {
    const emptyPage: BudgetPage = {
      ...page,
      overview: {
        plannedMinor: 0,
        spentInBudgetedCategoriesMinor: 0,
        remainingMinor: 0,
        unbudgetedSpentMinor: 0,
        activeBudgetCount: 0
      },
      items: []
    };
    mocks.useBudgets.mockReturnValue(queryResult(emptyPage));

    render(<BudgetsPage initialPage={emptyPage} categories={[category]} />);

    expect(screen.getByText("No monthly budgets yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add your first budget" })).toBeVisible();
    expect(screen.getByRole("link", { name: /prior spending in Reports/ })).toHaveAttribute(
      "href",
      "/reports"
    );
  });
});
