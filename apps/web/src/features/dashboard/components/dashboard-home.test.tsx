import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DashboardHome } from "./dashboard-home";

vi.mock("@/features/accounts", () => ({
  useAccounts: (initialData: Account[]) => ({ data: initialData }),
  useCreateAccount: () => ({ mutateAsync: vi.fn(), isPending: false })
}));
vi.mock("@/features/quick-add", () => ({
  useCreateTxn: () => ({ mutateAsync: vi.fn(), isPending: false })
}));
vi.mock("../hooks/use-recent-activity", () => ({
  useRecentActivity: (_limit: number, initialData: unknown) => ({ data: initialData })
}));

const timestamp = new Date("2026-07-16T00:00:00.000Z");

function account(overrides: Partial<Account>): Account {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    name: "HDFC Savings",
    type: "bank",
    openingBalanceMinor: 0,
    balanceMinor: 62_842_50,
    currency: "INR",
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("DashboardHome", () => {
  it("shows the onboarding zero state and opens the modal with the chosen starter type", async () => {
    const user = userEvent.setup();
    render(
      <DashboardHome email="harsh@example.com" initialAccounts={[]} initialRecentActivity={[]} />
    );

    expect(screen.getByRole("heading", { name: "Welcome to Ledger" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Investment/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Investment/ })).toHaveClass("border-accent");
  });

  it("shows the populated dashboard with accounts, recent activity, and quick add", () => {
    render(
      <DashboardHome
        email="harsh@example.com"
        initialAccounts={[account({})]}
        initialRecentActivity={[]}
      />
    );

    expect(screen.getByRole("heading", { name: "Home" })).toBeVisible();
    expect(screen.getByText(/Total balance/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Quick add" })).toBeVisible();
  });

  it("opens the create-account modal defaulted to bank from the accounts panel", async () => {
    const user = userEvent.setup();
    render(
      <DashboardHome
        email="harsh@example.com"
        initialAccounts={[account({})]}
        initialRecentActivity={[]}
      />
    );

    await user.click(screen.getByRole("button", { name: "+ Add account" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /Bank/ })).toHaveClass("border-accent");
  });
});
