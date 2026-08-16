import { render, screen } from "@testing-library/react";
import type {
  Account,
  CashflowResponse,
  DashboardInvestments,
  DashboardStats,
  MonthlySpending,
  RecentActivityItem,
  RecurringForecast,
  SpendMix,
  TopSpendingItem
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import AddTransactionPage from "./(app)/add/page";
import BudgetsRoute from "./(app)/budgets/page";
import DashboardPage from "./(app)/page";
import GoalsPage from "./(app)/goals/page";
import InsightsPage from "./(app)/insights/page";
import ReportsPage from "./(app)/reports/page";
import RecurringPage from "./(app)/recurring/page";
import SettingsPage from "./(app)/settings/page";
import SpendingWarningsRoute from "./(app)/spending-warnings/page";
import TransactionsPage from "./(app)/transactions/page";
import AuthLayout from "./(auth)/layout";
import LoginPage from "./(auth)/login/page";
import RegisterPage from "./(auth)/register/page";
import NotFound from "./not-found";

const mocks = vi.hoisted(
  (): {
    session: { user: { id: string; email: string } };
    accounts: Account[];
    recentActivity: RecentActivityItem[];
    stats: DashboardStats | null;
    monthlySpending: MonthlySpending | null;
    cashflow: CashflowResponse;
    spendMix: SpendMix;
    topSpending: TopSpendingItem[];
    recurringForecast: RecurringForecast;
    investments: DashboardInvestments;
  } => ({
    session: { user: { id: "user-1", email: "harsh@example.com" } },
    accounts: [],
    recentActivity: [],
    stats: null,
    monthlySpending: null,
    cashflow: { range: "6M", buckets: [] },
    spendMix: {
      range: "1M",
      totalMinor: 0,
      essential: { amountMinor: 0, pct: 0 },
      lifestyle: { amountMinor: 0, pct: 0 },
      uncategorized: { amountMinor: 0, pct: 0 }
    },
    topSpending: [],
    recurringForecast: { range: "1M", inMinor: 0, outMinor: 0, netMinor: 0, upcoming: [] },
    investments: { items: [] }
  })
);

vi.mock("@/lib/api/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/lib/theme-server", () => ({ getStoredTheme: async () => null }));
vi.mock("@/lib/accent-server", () => ({ getStoredAccent: async () => ({ kind: "default" }) }));
vi.mock("@/features/auth", () => ({
  LoginForm: () => <p>Mock login form</p>,
  RegisterForm: () => <p>Mock register form</p>,
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
vi.mock("@/features/insights/hooks/use-recent-activity", () => ({
  useRecentActivity: () => ({ data: mocks.recentActivity })
}));
vi.mock("@/features/insights/server/get-recent-activity", () => ({
  getRecentActivity: async () => mocks.recentActivity
}));
vi.mock("@/features/dashboard/server/get-stats", () => ({ getStats: async () => mocks.stats }));
vi.mock("@/features/dashboard/server/get-monthly-spending", () => ({
  getMonthlySpending: async () => mocks.monthlySpending
}));
vi.mock("@/features/dashboard/server/get-cashflow", () => ({
  getCashflow: async () => mocks.cashflow
}));
vi.mock("@/features/dashboard/server/get-spend-mix", () => ({
  getSpendMix: async () => mocks.spendMix
}));
vi.mock("@/features/dashboard/server/get-top-spending", () => ({
  getTopSpending: async () => mocks.topSpending
}));
vi.mock("@/features/dashboard/server/get-recurring-forecast", () => ({
  getRecurringForecast: async () => mocks.recurringForecast
}));
vi.mock("@/features/dashboard/server/get-investments", () => ({
  getInvestments: async () => mocks.investments
}));
vi.mock("@/features/dashboard/hooks/use-stats", () => ({
  useStats: () => ({ data: mocks.stats })
}));
vi.mock("@/features/dashboard/hooks/use-monthly-spending", () => ({
  useMonthlySpending: () => ({ data: mocks.monthlySpending })
}));
vi.mock("@/features/dashboard/hooks/use-cashflow", () => ({
  useCashflow: () => ({ data: mocks.cashflow })
}));
vi.mock("@/features/dashboard/hooks/use-spend-mix", () => ({
  useSpendMix: () => ({ data: mocks.spendMix })
}));
vi.mock("@/features/dashboard/hooks/use-top-spending", () => ({
  useTopSpending: () => ({ data: mocks.topSpending })
}));
vi.mock("@/features/dashboard/hooks/use-recurring-forecast", () => ({
  useRecurringForecast: () => ({ data: mocks.recurringForecast })
}));
vi.mock("@/features/dashboard/hooks/use-investments", () => ({
  useInvestments: () => ({ data: mocks.investments })
}));
vi.mock("@/features/categories/server/get-categories", () => ({ getCategories: async () => [] }));
vi.mock("@/features/budgets", () => ({
  BudgetsPage: () => <h1>Monthly budgets</h1>,
  BudgetDashboardPanel: () => <h2>Monthly budgets</h2>
}));
vi.mock("@/features/budgets/server/get-budgets", () => ({
  getBudgetPage: async () => null
}));
vi.mock("@/features/recurring", () => ({
  getRecurringRules: async () => [],
  getRecurringReconciliations: async () => [],
  getRecurringStats: async () => null,
  getDetectedStreams: async () => ({ items: [], nextCursor: null }),
  RecurringManager: () => <h1>Recurring</h1>
}));
vi.mock("@/features/goals", () => ({
  GoalManager: () => <h1>Goals</h1>
}));
vi.mock("@/features/goals/server/get-goals", () => ({
  getGoals: async () => [],
  getGoalPlan: async () => null
}));
vi.mock("@/features/profile", () => ({
  ProfileSummary: ({ email, action }: { email: string; action?: ReactNode }) => (
    <section>
      <p>{email}</p>
      {action}
    </section>
  ),
  EditDisplayNameForm: () => null
}));
vi.mock("@/features/profile/server/get-profile", () => ({ getProfile: async () => null }));
vi.mock("@/features/financial-profile", () => ({
  SalaryWorkPanel: () => <h2>Salary &amp; work</h2>
}));
vi.mock("@/features/financial-profile/server/get-financial-profile", () => ({
  SALARY_HISTORY_PAGE_SIZE: 10,
  getFinancialProfileState: async () => null,
  getSalaryStatistics: async () => null,
  getSalaryVersionPage: async () => null
}));
vi.mock("@/features/api-keys", () => ({
  getApiKeys: async () => []
}));
vi.mock("@/features/reports", () => ({
  ReportPage: () => <h1>Monthly report</h1>,
  reportMonthFromParam: () => "2026-06"
}));
vi.mock("@/features/reports/server/get-monthly-rollup", () => ({
  getMonthlyRollup: async () => null
}));
vi.mock("@/features/reports/components/pie-chart", () => ({
  PieChart: () => <svg role="img" aria-label="Spend mix pie chart" />
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
vi.mock("@/features/pending-transactions", () => ({
  PendingTransactionsPanel: () => null
}));
vi.mock("@/features/pending-transactions/server/get-pending-transactions", () => ({
  getPendingTransactions: async () => []
}));
vi.mock("@/features/spending-warnings", () => ({
  SpendingWarningsPage: () => <h1>Spending patterns</h1>,
  getSpendingWarnings: async () => null,
  parseSpendingWarningFilters: () => ({ filter: "all" })
}));

describe("route shells", () => {
  it("renders the insights and account page with the session email", async () => {
    render(await InsightsPage());
    expect(screen.getByRole("heading", { name: "Welcome to Ledger" })).toBeVisible();
    expect(screen.getByText("harsh@example.com")).toBeVisible();
  });

  it("renders the settings page's profile tab by default", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("harsh@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  it("switches to the appearance tab from the URL", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "appearance" }) }));
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("heading", { name: "Accent color" })).toBeVisible();
  });

  it("switches to the income tab from the URL", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "income" }) }));
    expect(screen.getByRole("tab", { name: "Income" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Salary & work" })).toBeVisible();
  });

  it("switches to the API keys tab from the URL", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "api-keys" }) }));
    expect(screen.getByRole("tab", { name: "API keys" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: /Manage API keys/ })).toHaveAttribute(
      "href",
      "/settings/api-keys"
    );
  });

  it("falls back to the profile tab for an unknown settings section", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "not-a-section" }) }));
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("harsh@example.com")).toBeVisible();
  });

  it("renders the dashboard's financial overview panels", async () => {
    mocks.stats = {
      period: "2026-07",
      spent: { valueMinor: 618_425_00, deltaPct: -8, trend: [700000, 650000, 618425] },
      income: { valueMinor: 920_000_00, deltaPct: 8, trend: [850000, 850000, 920000] },
      savingsRate: { valuePct: 33, deltaPct: 5, trend: [28, 30, 33] },
      netWorth: { valueMinor: 197_000_000_00, deltaPct: 4, trend: [168, 178, 197] }
    };
    mocks.cashflow = {
      range: "6M",
      buckets: [
        { label: "Jun", incomeMinor: 850_000_00, expenseMinor: 684_250_00 },
        { label: "Jul", incomeMinor: 920_000_00, expenseMinor: 618_425_00 }
      ]
    };
    mocks.monthlySpending = {
      period: "2026-07",
      asOf: new Date("2026-07-15T06:00:00.000Z"),
      totalMinor: 6_000,
      daily: [{ date: new Date("2026-06-30T18:30:00.000Z"), amountMinor: 6_000 }],
      weekly: [
        {
          startAt: new Date("2026-06-30T18:30:00.000Z"),
          endAt: new Date("2026-07-06T18:30:00.000Z"),
          amountMinor: 6_000
        }
      ]
    };
    mocks.spendMix = {
      range: "1M",
      totalMinor: 100_000_00,
      essential: { amountMinor: 60_000_00, pct: 60 },
      lifestyle: { amountMinor: 40_000_00, pct: 40 },
      uncategorized: { amountMinor: 0, pct: 0 }
    };
    mocks.topSpending = [
      {
        name: "Groceries",
        icon: "shopping-cart",
        color: "#f97316",
        amountMinor: 18_420_00,
        txnCount: 14
      }
    ];
    mocks.recurringForecast = {
      range: "1M",
      inMinor: 850_000_00,
      outMinor: 500_000_00,
      netMinor: 350_000_00,
      upcoming: [
        {
          ruleId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
          name: "Netflix",
          type: "expense",
          amountMinor: 649_00,
          nextRunAt: new Date("2026-08-09T00:00:00.000Z")
        }
      ]
    };
    mocks.investments = {
      items: [
        {
          assetId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
          name: "Nifty 50 Index",
          kind: "investment",
          currentValueMinor: 4_230_000_00,
          returnPct: 18.4,
          series: [
            { valuedAt: new Date("2026-06-01T00:00:00.000Z"), valueMinor: 4_000_000_00 },
            { valuedAt: new Date("2026-07-01T00:00:00.000Z"), valueMinor: 4_230_000_00 }
          ]
        }
      ]
    };

    render(await DashboardPage());

    expect(screen.getByRole("heading", { name: "Financial overview" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Cash flow" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "This month's spending rhythm" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Spend mix" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Top spending" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Recurring commitments" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Investments & deposits" })).toBeVisible();
    expect(screen.getByText("Groceries")).toBeVisible();
    expect(screen.getByText("Netflix")).toBeVisible();
    expect(screen.getByText("Nifty 50 Index")).toBeVisible();

    mocks.stats = null;
    mocks.monthlySpending = null;
    mocks.cashflow = { range: "6M", buckets: [] };
    mocks.spendMix = {
      range: "1M",
      totalMinor: 0,
      essential: { amountMinor: 0, pct: 0 },
      lifestyle: { amountMinor: 0, pct: 0 },
      uncategorized: { amountMinor: 0, pct: 0 }
    };
    mocks.topSpending = [];
    mocks.recurringForecast = { range: "1M", inMinor: 0, outMinor: 0, netMinor: 0, upcoming: [] };
    mocks.investments = { items: [] };
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
    render(await InsightsPage());

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
    render(await InsightsPage());

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

    render(await SpendingWarningsRoute({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Spending patterns" })).toBeVisible();

    render(await GoalsPage());
    expect(screen.getByRole("heading", { name: "Goals" })).toBeVisible();

    render(await BudgetsRoute());
    expect(screen.getByRole("heading", { name: "Monthly budgets" })).toBeVisible();
  });

  it("renders the auth, login, and not-found shells", async () => {
    render(await AuthLayout({ children: <p>Auth content</p> }));
    expect(screen.getByText("Auth content")).toBeVisible();

    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    expect(screen.getByText("Mock login form")).toBeVisible();

    render(<RegisterPage />);
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeVisible();
    expect(screen.getByText("Mock register form")).toBeVisible();

    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to TreasuryOps" })).toHaveAttribute("href", "/");
  });
});
