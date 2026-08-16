import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  FinancialProfileState,
  SalaryStatistics,
  SalaryVersionPage
} from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SalaryWorkPanel } from "./salary-work-panel";

vi.mock("../hooks/use-salary-mutations", () => ({
  useUpdateFinancialProfile: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    idempotencyKey: "profile-key"
  }),
  useCreateSalaryVersion: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    idempotencyKey: "salary-key"
  })
}));

const mocks = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const ASOF = new Date("2026-08-16T00:00:00.000Z");

const VERSION = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  userId: "user-1",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  source: "manually_confirmed" as const,
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

const UNCONFIGURED: FinancialProfileState = {
  configured: false,
  profile: null,
  currentSalaryVersion: null,
  upcomingSalaryVersion: null,
  suggestedMonthlyWorkMinutes: 9_600,
  asOf: ASOF
};

const CONFIGURED: FinancialProfileState = {
  configured: true,
  profile: {
    userId: "user-1",
    monthlyWorkMinutes: 9_600,
    salaryCreditDay: 1,
    expectedAnnualIncrementBps: null,
    incomeStability: "stable",
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z")
  },
  currentSalaryVersion: VERSION,
  upcomingSalaryVersion: null,
  suggestedMonthlyWorkMinutes: 9_600,
  asOf: ASOF
};

const STATISTICS: SalaryStatistics = {
  currentNetMonthlySalaryMinor: 12_50_000,
  annualizedNetIncomeMinor: 1_50_00_000,
  netHourlyWageMinor: 7_813,
  eightHourWorkdayEquivalentMinor: 62_500,
  effectiveFrom: VERSION.effectiveFrom,
  monthlyWorkMinutes: 9_600,
  salaryVersionId: VERSION.id,
  computedAt: ASOF,
  formulaVersion: 1,
  dataQuality: "complete",
  assumptions: {
    monthsPerYear: 12,
    minutesPerHour: 60,
    standardWorkdayMinutes: 480,
    monthlyWorkMinutes: 9_600,
    incomeStability: "stable",
    expectedAnnualIncrementBps: null,
    rounding: "half_up"
  },
  limitations: []
};

const HISTORY: SalaryVersionPage = {
  items: [VERSION],
  pageInfo: { nextCursor: null, hasMore: false, limit: 20 }
};

function renderPanel(
  overrides: Partial<Parameters<typeof SalaryWorkPanel>[0]> = {}
): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(
    <SalaryWorkPanel
      initialState={UNCONFIGURED}
      initialStatistics={null}
      initialHistory={{ items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 20 } }}
      historyPageSize={20}
      {...overrides}
    />,
    { wrapper: Wrapper }
  );
}

describe("SalaryWorkPanel", () => {
  it("shows the setup state with no statistics and an empty history", () => {
    renderPanel();

    expect(screen.getByRole("heading", { name: "Set up salary & work" })).toBeVisible();
    expect(screen.getByText(/the 160-hour figure below is a suggestion/)).toBeVisible();
    expect(screen.getByLabelText("Net monthly in-hand salary")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Salary statistics" })).toBeNull();
    expect(screen.getByText("No salary history yet")).toBeVisible();
  });

  it("shows the saved state with statistics and read-only history", () => {
    renderPanel({
      initialState: CONFIGURED,
      initialStatistics: STATISTICS,
      initialHistory: HISTORY
    });

    expect(screen.getByRole("heading", { name: "Salary & work" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Salary statistics" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Net hourly wage" })).toHaveTextContent("₹78.13");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByLabelText("Net monthly in-hand salary")).toBeNull();
  });

  it("opens the add-salary-change sheet from the section action", async () => {
    const user = userEvent.setup();
    renderPanel({
      initialState: CONFIGURED,
      initialStatistics: STATISTICS,
      initialHistory: HISTORY
    });

    await user.click(screen.getByRole("button", { name: "Add salary change" }));
    expect(await screen.findByRole("dialog", { name: "Add salary change" })).toBeVisible();
  });

  it("explains a failed profile load without pretending the salary changed", () => {
    renderPanel({ initialState: null });

    expect(screen.getByText(/could not load your salary profile/i)).toBeVisible();
    expect(screen.queryByLabelText("Net monthly in-hand salary")).toBeNull();
  });

  it("exposes a live region for screen-reader announcements", () => {
    renderPanel();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveClass("sr-only");
  });
});
