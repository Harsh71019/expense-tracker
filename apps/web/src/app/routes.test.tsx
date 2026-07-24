import { render, screen } from "@testing-library/react";
import type { Account, RecentActivityItem } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import AddTransactionPage from "./(app)/add/page";
import DashboardPage from "./(app)/page";
import ReportsPage from "./(app)/reports/page";
import RecurringPage from "./(app)/recurring/page";
import SettingsPage from "./(app)/settings/page";
import TransactionsPage from "./(app)/transactions/page";
import AuthLayout from "./(auth)/layout";
import LoginPage from "./(auth)/login/page";
import NotFound from "./not-found";

const mocks = vi.hoisted(
  (): {
    session: { user: { id: string; email: string } };
    accounts: Account[];
    recentActivity: RecentActivityItem[];
  } => ({
    session: { user: { id: "user-1", email: "harsh@example.com" } },
    accounts: [],
    recentActivity: []
  })
);

vi.mock("@/lib/api/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/lib/theme-server", () => ({ getStoredTheme: async () => null }));
vi.mock("@/lib/accent-server", () => ({ getStoredAccent: async () => ({ kind: "default" }) }));
vi.mock("@/features/auth", () => ({
  LoginForm: () => <p>Mock login form</p>,
  SignOutButton: () => <button>Sign out</button>
}));
vi.mock("@/features/quick-add", () => ({
  QuickAddForm: () => <h1>Quick add</h1>,
  getAccounts: async () => mocks.accounts,
  useCreateTxn: () => ({ mutateAsync: async () => ({}), isPending: false })
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: mocks.accounts }),
  useCreateAccount: () => ({ mutateAsync: async () => ({}), isPending: false })
}));
vi.mock("@/features/accounts/server/get-accounts", () => ({
  getAccounts: async () => mocks.accounts
}));
vi.mock("@/features/dashboard/hooks/use-recent-activity", () => ({
  useRecentActivity: () => ({ data: mocks.recentActivity })
}));
vi.mock("@/features/dashboard/server/get-recent-activity", () => ({
  getRecentActivity: async () => mocks.recentActivity
}));
vi.mock("@/features/categories/server/get-categories", () => ({ getCategories: async () => [] }));
vi.mock("@/features/recurring", () => ({
  getRecurringRules: async () => [],
  RecurringManager: () => <h1>Recurring</h1>
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
  reportMonthFromParam: () => "2026-06"
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
    expect(screen.getByRole("heading", { name: "Welcome to Ledger" })).toBeVisible();
    expect(screen.getByText("harsh@example.com")).toBeVisible();

    render(await SettingsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByText("Signed in as")).toBeVisible();
    expect(screen.getAllByText("harsh@example.com")).toHaveLength(2);
  });

  it("renders the selected settings section from the URL", async () => {
    render(
      await SettingsPage({
        searchParams: Promise.resolve({ tab: "appearance" })
      })
    );

    expect(screen.getByRole("tab", { name: /Appearance/ })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Appearance");
    expect(screen.getByRole("heading", { name: "Accent color" })).toBeVisible();
    expect(screen.queryByText("Signed in as")).not.toBeInTheDocument();
  });

  it("falls back to the profile tab for an unknown settings section", async () => {
    render(
      await SettingsPage({
        searchParams: Promise.resolve({ tab: "not-a-section" })
      })
    );

    expect(screen.getByRole("tab", { name: /Profile/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Profile");
    expect(screen.getByText("Signed in as")).toBeVisible();
  });

  it("renders the current balance for active accounts", async () => {
    mocks.accounts = [
      {
        id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
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
    expect(screen.getByText(/Total balance/)).toHaveTextContent("Total balance · 1 active account");
    mocks.accounts = [];
  });

  it("formats negative balances and plural account labels", async () => {
    mocks.accounts = [
      {
        id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
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
        id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
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
    expect(screen.getByText(/Total balance/)).toHaveTextContent(
      "Total balance · 2 active accounts"
    );
    mocks.accounts = [];
  });

  it("renders each planned ledger route with its appropriate placeholder", async () => {
    render(<AddTransactionPage />);
    expect(screen.getByRole("heading", { name: "Quick add" })).toBeVisible();

    render(await TransactionsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeVisible();

    render(await ReportsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Monthly report" })).toBeVisible();

    render(await RecurringPage());
    expect(screen.getByRole("heading", { name: "Recurring" })).toBeVisible();
  });

  it("renders the auth, login, and not-found shells", async () => {
    render(await AuthLayout({ children: <p>Auth content</p> }));
    expect(screen.getByText("Auth content")).toBeVisible();

    render(<LoginPage />);
    expect(screen.getByText("Mock login form")).toBeVisible();

    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to TreasuryOps" })).toHaveAttribute("href", "/");
  });
});
