import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Category, RecurringRule, RecurringStats } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { RecurringManager } from "./recurring-manager";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("../hooks/use-recurring-rules", () => ({
  useRecurringRules: (rules: RecurringRule[]) => ({ data: rules, error: null }),
  useUpdateRecurringRule: () => ({
    mutateAsync: mocks.update,
    isPending: false,
    variables: undefined
  })
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: (accounts?: Account[]) => ({ data: accounts ?? [] })
}));
vi.mock("@/features/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/categories")>();
  return {
    ...actual,
    useCategories: (categories?: Category[]) => ({ data: categories ?? [] })
  };
});
vi.mock("./recurring-rule-drawer", () => ({
  RecurringRuleDrawer: ({ rule }: { rule?: RecurringRule }) => (
    <div role="dialog">{rule === undefined ? "New recurring rule" : "Edit recurring rule"}</div>
  )
}));
vi.mock("../hooks/use-recurring-reconciliations", () => ({
  useRecurringReconciliations: (items: unknown[]) => ({ data: items, error: null }),
  useResolveRecurringReconciliation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null
  })
}));
vi.mock("./recurring-stats-cards", () => ({
  RecurringStatsCards: () => <div>Recurring insights</div>
}));

const timestamp = new Date("2026-07-19T00:00:00.000Z");
const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "HDFC Savings",
  type: "bank",
  openingBalanceMinor: 0,
  balanceMinor: 100_000,
  currency: "INR",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "user-1",
  name: "Housing",
  kind: "expense",
  icon: "🏠",
  color: "#f97316",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const rule: RecurringRule = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66bef0",
  userId: "user-1",
  template: {
    accountId: account.id,
    categoryId: category.id,
    type: "expense",
    amountMinor: 250_000,
    description: "Monthly rent",
    tags: []
  },
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: timestamp,
  nextRunAt: new Date("2026-08-01T00:00:00.000Z"),
  isPaused: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const stats: RecurringStats = {
  forecastDays: 30,
  totalRules: 1,
  activeRules: 1,
  pausedRules: 0,
  upcomingTransactionCount: 1,
  upcomingExpenseMinor: rule.template.amountMinor,
  upcomingIncomeMinor: 0,
  upcomingNetMinor: -rule.template.amountMinor,
  topSpendingCategory: null
};

describe("RecurringManager", () => {
  it("renders schedule details and pauses a rule", async () => {
    mocks.update.mockResolvedValue({ ...rule, isPaused: true });
    render(
      <RecurringManager
        initialRules={[rule]}
        accounts={[account]}
        categories={[category]}
        initialReconciliations={[]}
        initialStats={stats}
      />
    );

    expect(screen.getByRole("heading", { name: "Recurring" })).toBeVisible();
    expect(screen.getByText("Monthly rent")).toBeVisible();
    expect(screen.getByText(/Every month on day 1/)).toBeVisible();
    expect(screen.getByText("−₹2,500.00")).toBeVisible();

    const pauseButton = screen.getByRole("button", { name: "Pause" });
    expect(pauseButton.parentElement).toHaveClass("grid-cols-2");
    await userEvent.click(pauseButton);
    expect(mocks.update).toHaveBeenCalledWith({ ruleId: rule.id, patch: { isPaused: true } });
  });

  it("opens create and edit drawers", async () => {
    render(
      <RecurringManager
        initialRules={[rule]}
        accounts={[account]}
        categories={[category]}
        initialReconciliations={[]}
        initialStats={stats}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /New rule/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("New recurring rule");
  });

  it("explains the account prerequisite in an empty state", () => {
    render(
      <RecurringManager
        initialRules={[]}
        accounts={[]}
        categories={[]}
        initialReconciliations={[]}
        initialStats={null}
      />
    );
    expect(screen.getByText(/Create an account before adding/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Create recurring rule/ })).toBeDisabled();
  });
});
