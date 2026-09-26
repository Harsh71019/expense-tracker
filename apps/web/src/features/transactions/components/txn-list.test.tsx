import { render, screen, within } from "@testing-library/react";
import type { PendingTransaction } from "@treasury-ops/shared";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TxnList } from "./txn-list";

const mocks = vi.hoisted(() => ({
  batchCategorize: vi.fn(),
  batchPending: false,
  empty: false,
  fetchNextPage: vi.fn(),
  hasNextPage: true,
  fetching: false,
  isError: false,
  push: vi.fn(),
  exportCsv: vi.fn(),
  exportPending: false,
  downloadCsvFile: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: [] })
}));
vi.mock("@/features/categories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/categories")>();
  return {
    ...actual,
    useCategories: () => ({
      data: [
        {
          id: "3fa85f64-5717-4562-b3fc-2c963f66be99",
          userId: "user-1",
          name: "Salary",
          kind: "income",
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]
    })
  };
});
vi.mock("../hooks/use-batch-categorize", () => ({
  useBatchCategorize: () => ({
    mutateAsync: mocks.batchCategorize,
    isPending: mocks.batchPending
  })
}));
vi.mock("@/features/export/hooks/use-export-csv", () => ({
  useExportCsv: () => ({ mutateAsync: mocks.exportCsv, isPending: mocks.exportPending })
}));
vi.mock("../model/export-csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../model/export-csv")>();
  return { ...actual, downloadCsvFile: mocks.downloadCsvFile };
});
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));
vi.mock("@/features/transfers/hooks/use-transfers", () => ({
  useReverseTransfer: () => ({ mutate: vi.fn(), isPending: false })
}));
vi.mock("./transaction-insights-cards", () => ({
  TransactionInsightsCards: () => <div>insights</div>
}));
vi.mock("@/features/pending-transactions/components/pending-transactions-panel", () => ({
  PendingTransactionsPanel: () => <div>pending-transactions</div>
}));

const transaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  type: "income" as const,
  amountMinor: 4_000,
  occurredAt: new Date(),
  description: "Refund",
  tags: [],
  currency: "INR" as const,
  source: "manual" as const,
  paymentRail: "unknown" as const,
  counterpartyHandle: null,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

vi.mock("../hooks/use-txn-list", () => ({
  useTxnList: () => ({
    data: {
      pages: [
        {
          items: mocks.empty ? [] : [transaction],
          pageInfo: { nextCursor: "next", hasMore: true, limit: 50 }
        }
      ]
    },
    hasNextPage: mocks.hasNextPage,
    isFetchingNextPage: mocks.fetching,
    isError: mocks.isError,
    fetchNextPage: mocks.fetchNextPage
  })
}));

// The drawer/sheet have their own dedicated tests; here we only verify TxnList opens the right
// one with the right data, so their real hook dependencies don't need to be mocked here too.
vi.mock("./txn-detail-drawer", () => ({
  TxnDetailDrawer: ({
    transaction: txn,
    onClose
  }: {
    transaction: { description: string };
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="detail-drawer">
      {txn.description}
      <button onClick={onClose}>close-drawer</button>
    </div>
  )
}));
vi.mock("./create-txn-sheet", () => ({
  CreateTxnSheet: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="create-sheet">
      <button onClick={onClose}>close-sheet</button>
    </div>
  )
}));

describe("TxnList", () => {
  const page = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
  const pendingTransactions: PendingTransaction[] = [];

  beforeEach(() => {
    mocks.exportCsv.mockReset();
    mocks.downloadCsvFile.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.exportPending = false;
  });

  it("opens the detail drawer on row click, paginates, and surfaces refresh errors", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.hasNextPage = true;
    mocks.isError = true;
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    expect(screen.getByText("Description").parentElement?.parentElement).toHaveClass(
      "hidden",
      "md:flex"
    );
    await user.click(screen.getByRole("button", { name: /Refund/ }));
    const drawer = screen.getByRole("dialog", { name: "detail-drawer" });
    expect(drawer).toBeVisible();
    expect(within(drawer).getByText("Refund")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.fetchNextPage).toHaveBeenCalled();
    expect(screen.getByText(/Could not refresh/)).toBeVisible();
  });

  it("opens the create sheet from the Add transaction button", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.isError = false;
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    await user.click(screen.getByRole("button", { name: /Add transaction/ }));
    expect(screen.getByRole("dialog", { name: "create-sheet" })).toBeVisible();
  });

  it("toggles table density between comfortable and compact", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.isError = false;
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    const compactBtn = screen.getByRole("button", { name: "Compact" });
    await user.click(compactBtn);
    expect(compactBtn).toHaveClass("bg-surface-elevated");
  });

  it("uses the empty state when no rows are returned", () => {
    mocks.empty = true;
    mocks.hasNextPage = false;
    mocks.isError = false;
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );
    expect(screen.getByRole("heading", { name: "No transactions match" })).toBeVisible();
  });

  it("disables pagination while the next page is loading", () => {
    mocks.empty = false;
    mocks.hasNextPage = true;
    mocks.isError = false;
    mocks.fetching = true;
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );
    expect(screen.getByRole("button", { name: "Loading entries…" })).toBeDisabled();
  });

  it("selects transactions and assigns one matching category to the batch", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.isError = false;
    mocks.batchCategorize.mockResolvedValue({
      transactionIds: [transaction.id],
      categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be99",
      updatedCount: 1
    });
    render(
      <TxnList
        filters={{ limit: 50 }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Refund" }));
    expect(screen.getByRole("region", { name: "Bulk category assignment" })).toBeVisible();
    await user.click(screen.getByRole("combobox", { name: "Assign income category" }));
    await user.click(screen.getByRole("option", { name: "Salary" }));
    await user.click(screen.getByRole("button", { name: "Assign category" }));

    expect(mocks.batchCategorize).toHaveBeenCalledWith({
      transactionIds: [transaction.id],
      categoryId: "3fa85f64-5717-4562-b3fc-2c963f66be99"
    });
  });

  it("toggles sorting when clicking Date and Amount column headers", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.isError = false;
    render(
      <TxnList
        filters={{ limit: 50, sort: "date_desc" }}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    await user.click(screen.getByRole("button", { name: /Sort by date/ }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions?sort=date_asc");

    await user.click(screen.getByRole("button", { name: /Sort by amount/ }));
    expect(mocks.push).toHaveBeenCalledWith("/transactions?sort=amount_desc");
  });

  it("exports every transaction matching the active filters through the server", async () => {
    const user = userEvent.setup();
    const filters = {
      accountId: transaction.accountId,
      from: new Date("2026-08-01T00:00:00.000Z"),
      minAmountMinor: 1_000,
      q: "refund",
      tag: "work",
      sort: "amount_desc" as const,
      limit: 50
    };
    mocks.empty = false;
    mocks.isError = false;
    mocks.exportCsv.mockResolvedValue("Date,Amount\r\n2026-08-01,40.00\r\n");
    render(
      <TxnList
        filters={filters}
        initialPage={page}
        initialInsights={null}
        initialPendingTransactions={pendingTransactions}
      />
    );

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(mocks.exportCsv).toHaveBeenCalledWith(filters);
    expect(mocks.downloadCsvFile).toHaveBeenCalledWith(
      expect.stringMatching(/^treasury-ops-transactions-\d{4}-\d{2}-\d{2}\.csv$/),
      "Date,Amount\r\n2026-08-01,40.00\r\n"
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Exported all matching transactions to CSV");
  });
});
