import { render, screen } from "@testing-library/react";
import type { Account, AccountInsights } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import AccountDetailRoute, { generateMetadata } from "./page";

const accountId = "3fa85f64-5717-4562-b3fc-2c963f66beef";
const account: Account = {
  id: accountId,
  userId: "user-1",
  name: "HDFC Salary",
  type: "bank",
  currency: "INR",
  openingBalanceMinor: 100_000,
  balanceMinor: 120_000,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-23T00:00:00.000Z")
};
const insights: AccountInsights = {
  range: "90d",
  from: new Date("2026-05-26T18:30:00.000Z"),
  to: new Date("2026-08-24T18:29:59.999Z"),
  bucket: "day",
  summary: { incomeMinor: 30_000, expenseMinor: 10_000, netMinor: 20_000, transactionCount: 2 },
  balanceSeries: [{ period: "2026-08-23", balanceMinor: 120_000 }],
  cashflowSeries: [{ period: "2026-08-23", incomeMinor: 30_000, expenseMinor: 10_000 }],
  spendingByCategory: []
};

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  getInsights: vi.fn(),
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getTxnPage: vi.fn(),
  notFound: vi.fn()
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_NOT_FOUND");
  }
}));
vi.mock("@/features/accounts/components/account-detail", () => ({
  AccountDetail: ({
    account: value,
    insights: accountInsights
  }: Readonly<{ account: Account; insights: AccountInsights }>) => (
    <h1>
      {value.name} · {accountInsights.range}
    </h1>
  )
}));
vi.mock("@/features/accounts/server/get-account", () => ({ getAccount: mocks.getAccount }));
vi.mock("@/features/accounts/server/get-account-insights", () => ({
  getAccountInsights: mocks.getInsights
}));
vi.mock("@/features/accounts/server/get-accounts", () => ({ getAccounts: mocks.getAccounts }));
vi.mock("@/features/categories/server/get-categories", () => ({
  getCategories: mocks.getCategories
}));
vi.mock("@/features/transactions/server/get-txn-page", () => ({
  getTxnPage: mocks.getTxnPage
}));

describe("AccountDetailRoute", () => {
  it("renders the selected account range with an account-filtered first page", async () => {
    mocks.getAccount.mockResolvedValue(account);
    mocks.getInsights.mockResolvedValue(insights);
    mocks.getAccounts.mockResolvedValue([account]);
    mocks.getCategories.mockResolvedValue([]);
    mocks.getTxnPage.mockResolvedValue({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 20 }
    });

    render(
      await AccountDetailRoute({
        params: Promise.resolve({ accountId }),
        searchParams: Promise.resolve({ range: "90d" })
      })
    );

    expect(screen.getByRole("heading", { name: "HDFC Salary · 90d" })).toBeVisible();
    expect(mocks.getInsights).toHaveBeenCalledWith(accountId, "90d");
    expect(mocks.getTxnPage).toHaveBeenCalledWith({ accountId, limit: 20 });
  });

  it("uses the account in metadata and rejects missing accounts", async () => {
    mocks.getAccount.mockResolvedValueOnce(account);
    await expect(
      generateMetadata({
        params: Promise.resolve({ accountId }),
        searchParams: Promise.resolve({})
      })
    ).resolves.toEqual({ title: "HDFC Salary account" });

    mocks.getAccount.mockResolvedValue(null);
    mocks.getInsights.mockResolvedValue(insights);
    mocks.getAccounts.mockResolvedValue([]);
    mocks.getCategories.mockResolvedValue([]);
    mocks.getTxnPage.mockResolvedValue({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 20 }
    });
    await expect(
      AccountDetailRoute({
        params: Promise.resolve({ accountId }),
        searchParams: Promise.resolve({})
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });
});
