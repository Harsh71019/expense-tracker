import { render, screen } from "@testing-library/react";
import type { Account } from "@vyaya/shared";
import { describe, expect, it, vi } from "vitest";

import AddTransactionPage from "./(app)/add/page";
import DashboardPage from "./(app)/page";
import MorePage from "./(app)/more/page";
import ReportsPage from "./(app)/reports/page";
import TransactionsPage from "./(app)/transactions/page";
import AuthLayout from "./(auth)/layout";
import LoginPage from "./(auth)/login/page";
import NotFound from "./not-found";

const mocks = vi.hoisted(
  (): { session: { user: { id: string; email: string } }; accounts: Account[] } => ({
    session: { user: { id: "user-1", email: "harsh@example.com" } },
    accounts: []
  })
);

vi.mock("@/lib/api/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/lib/theme-server", () => ({ getStoredTheme: async () => null }));
vi.mock("@/features/auth", () => ({
  LoginForm: () => <p>Mock login form</p>,
  SignOutButton: () => <button>Sign out</button>
}));
vi.mock("@/features/quick-add", () => ({
  QuickAddForm: () => <h1>Quick add</h1>,
  getAccounts: async () => mocks.accounts
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: mocks.accounts })
}));
vi.mock("@/features/accounts/server/get-accounts", () => ({
  getAccounts: async () => mocks.accounts
}));
vi.mock("@/features/profile", () => ({
  ProfileSummary: ({ email }: { email: string }) => (
    <section>
      <p>Signed in as</p>
      <p>{email}</p>
    </section>
  )
}));
vi.mock("@/features/profile/server/get-profile", () => ({ getProfile: async () => null }));
vi.mock("@/features/reports", () => ({
  ReportPage: () => <h1>Monthly report</h1>,
  getMonthlyRollup: async () => null,
  defaultReportMonth: () => "2026-06"
}));
vi.mock("@/features/transactions", () => ({
  parseTransactionFilters: () => ({ limit: 50 }),
  TxnList: () => <h1>Transactions</h1>
}));
vi.mock("@/features/transactions/server/get-txn-page", () => ({
  getTxnPage: async () => ({
    items: [],
    pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
  })
}));

describe("route shells", () => {
  it("renders the dashboard and account page with the session email", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("heading", { name: "Overview" })).toBeVisible();
    expect(screen.getByText("harsh@example.com")).toBeVisible();

    render(await MorePage());
    expect(screen.getByText("Signed in as")).toBeVisible();
    expect(screen.getAllByText("harsh@example.com")).toHaveLength(2);
  });

  it("renders the current balance for active accounts", async () => {
    mocks.accounts = [
      {
        id: "507f1f77bcf86cd799439011",
        userId: "user-1",
        name: "Cash",
        type: "cash",
        openingBalanceMinor: 0,
        balanceMinor: 12_345,
        currency: "INR",
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    render(await DashboardPage());

    const balanceElements = screen.getAllByText("+₹123.45");
    expect(balanceElements.length).toBeGreaterThanOrEqual(1);
    expect(balanceElements[0]).toBeVisible();
    expect(screen.getByText("Across 1 active account.")).toBeVisible();
    mocks.accounts = [];
  });

  it("formats negative balances and plural account labels", async () => {
    mocks.accounts = [
      {
        id: "507f1f77bcf86cd799439011",
        userId: "user-1",
        name: "Card",
        type: "credit_card",
        openingBalanceMinor: 0,
        balanceMinor: -500,
        currency: "INR",
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: "507f1f77bcf86cd799439012",
        userId: "user-1",
        name: "Cash",
        type: "cash",
        openingBalanceMinor: 0,
        balanceMinor: 400,
        currency: "INR",
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    render(await DashboardPage());

    expect(screen.getByText("−₹1.00")).toBeVisible();
    expect(screen.getByText("Across 2 active accounts.")).toBeVisible();
    mocks.accounts = [];
  });

  it("renders each planned ledger route with its appropriate placeholder", async () => {
    render(<AddTransactionPage />);
    expect(screen.getByRole("heading", { name: "Quick add" })).toBeVisible();

    render(await TransactionsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeVisible();

    render(await ReportsPage());
    expect(screen.getByRole("heading", { name: "Monthly report" })).toBeVisible();
  });

  it("renders the auth, login, and not-found shells", async () => {
    render(await AuthLayout({ children: <p>Auth content</p> }));
    expect(screen.getByText("Auth content")).toBeVisible();

    render(<LoginPage />);
    expect(screen.getByText("Mock login form")).toBeVisible();

    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to Vyaya" })).toHaveAttribute("href", "/");
  });
});
