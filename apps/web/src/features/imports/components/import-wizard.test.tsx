import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Category, ImportBatch, StagedRow } from "@vyaya/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportWizard } from "./import-wizard";

const account: Account = {
  id: "507f1f77bcf86cd799439011",
  userId: "u1",
  name: "HDFC Savings",
  type: "bank",
  currency: "INR",
  balanceMinor: 0,
  openingBalanceMinor: 0,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

const category: Category = {
  id: "507f1f77bcf86cd799439012",
  userId: "u1",
  name: "Groceries",
  kind: "expense",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

function makeBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: "507f1f77bcf86cd799439021",
    userId: "u1",
    accountId: account.id,
    filename: "HDFC-Statement-Jun.csv",
    fileHash: "hash",
    mapping: {
      date: "Date",
      description: "Narration",
      dateFormat: "DD/MM/YYYY",
      amountConvention: "debit_credit_cols",
      debit: "Withdrawal Amt.",
      credit: "Deposit Amt."
    },
    status: "staged",
    stats: { total: 2, staged: 2, duplicates: 0, committed: 0 },
    createdAt: new Date("2026-07-16T20:05:00.000Z"),
    updatedAt: new Date("2026-07-16T20:05:00.000Z"),
    ...overrides
  };
}

const mocks = vi.hoisted(() => {
  const batches: ImportBatch[] = [];
  const stagedRows: StagedRow[] = [];
  return {
    batches,
    uploadMutateAsync: vi.fn(),
    uploadPending: false,
    commitMutateAsync: vi.fn(),
    commitPending: false,
    revertMutateAsync: vi.fn(),
    revertPending: false,
    updateMutate: vi.fn(),
    stagedRows
  };
});

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: [account] }) }));
vi.mock("@/features/categories", () => ({ useCategories: () => ({ data: [category] }) }));
vi.mock("../hooks/use-import-batches", () => ({
  useImportBatches: () => ({ data: mocks.batches, isError: false })
}));
vi.mock("../hooks/use-upload-import", () => ({
  useUploadImport: () => ({ mutateAsync: mocks.uploadMutateAsync, isPending: mocks.uploadPending })
}));
vi.mock("../hooks/use-commit-batch", () => ({
  useCommitBatch: () => ({ mutateAsync: mocks.commitMutateAsync, isPending: mocks.commitPending })
}));
vi.mock("../hooks/use-revert-batch", () => ({
  useRevertBatch: () => ({ mutateAsync: mocks.revertMutateAsync, isPending: mocks.revertPending })
}));
vi.mock("../hooks/use-saved-import-mapping", () => ({
  useSavedImportMapping: () => ({ data: undefined })
}));
vi.mock("../hooks/use-staged-rows", () => ({
  useStagedRows: () => ({
    data: {
      pages: [
        { items: mocks.stagedRows, pageInfo: { nextCursor: null, hasMore: false, limit: 50 } }
      ]
    },
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn()
  })
}));
vi.mock("../hooks/use-update-staged-row", () => ({
  useUpdateStagedRow: () => ({ mutate: mocks.updateMutate, isPending: false })
}));

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

function renderWizard(): ReturnType<typeof render> {
  return render(<ImportWizard initialBatches={mocks.batches} />, { wrapper });
}

describe("ImportWizard", () => {
  beforeEach(() => {
    mocks.batches = [];
    mocks.uploadMutateAsync.mockReset();
    mocks.uploadPending = false;
    mocks.commitMutateAsync.mockReset();
    mocks.commitPending = false;
    mocks.revertMutateAsync.mockReset();
    mocks.revertPending = false;
    mocks.updateMutate.mockReset();
    mocks.stagedRows = [];
  });

  it("shows the empty list and starts a new import", async () => {
    const user = userEvent.setup();
    renderWizard();

    expect(screen.getByText("No statements imported")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /New import/ }));

    expect(screen.getByRole("heading", { name: "New import" })).toBeVisible();
    expect(screen.getByText("Which account is this statement for?")).toBeVisible();
  });

  it("walks upload → map → review and commits the batch", async () => {
    const user = userEvent.setup();
    const uploaded = makeBatch();
    mocks.uploadMutateAsync.mockResolvedValue(uploaded);
    mocks.commitMutateAsync.mockResolvedValue({ ...uploaded, status: "committed" });
    mocks.stagedRows = [
      {
        id: "507f1f77bcf86cd799439031",
        batchId: uploaded.id,
        rowNumber: 1,
        raw: {},
        parsed: {
          occurredAt: new Date("2026-07-01T00:00:00.000Z"),
          amountMinor: 45000,
          type: "expense",
          description: "SWIGGY*ORDER 4821"
        },
        problems: [],
        isDuplicate: false,
        include: true
      }
    ];
    renderWizard();

    await user.click(screen.getByRole("button", { name: /New import/ }));
    const csv = new File(["Date,Amount"], "statement.csv", { type: "text/csv" });
    const input = document.querySelector("input[type=file]");
    if (!(input instanceof HTMLInputElement)) throw new Error("Expected a file input.");
    await user.upload(input, csv);
    await user.selectOptions(screen.getByLabelText(/Which account/), account.id);
    await user.click(screen.getByRole("button", { name: "Map columns →" }));

    expect(screen.getByText("Start from a bank preset:")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "HDFC" }));
    await user.click(screen.getByRole("button", { name: "Review rows →" }));

    expect(mocks.uploadMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account.id, file: csv })
    );
    expect(await screen.findByText("SWIGGY*ORDER 4821")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Commit 1 transactions" }));
    expect(screen.getByText("Commit this import?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Post 1 transactions" }));

    expect(mocks.commitMutateAsync).toHaveBeenCalledWith(uploaded.id);
    expect(await screen.findByText("No statements imported")).toBeVisible();
  });

  it("resumes a staged batch straight into review", async () => {
    const user = userEvent.setup();
    mocks.batches = [makeBatch()];
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Resume review" }));
    expect(screen.getByRole("heading", { name: "New import" })).toBeVisible();
    expect(screen.getByText("Commit 0 transactions")).toBeVisible();
  });

  it("reverts a committed batch after confirming", async () => {
    const user = userEvent.setup();
    mocks.batches = [
      makeBatch({
        status: "committed",
        stats: { total: 2, staged: 2, duplicates: 0, committed: 2 },
        committedAt: new Date("2026-07-17T00:00:00.000Z")
      })
    ];
    mocks.revertMutateAsync.mockResolvedValue(mocks.batches[0]);
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Revert" }));
    expect(screen.getByText("Revert this batch?")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reverse 2 transactions" }));
    expect(mocks.revertMutateAsync).toHaveBeenCalledWith(mocks.batches[0]?.id);
  });

  it("cancels out of the wizard back to the list without uploading", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: /New import/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Imports" })).toBeVisible();
    expect(mocks.uploadMutateAsync).not.toHaveBeenCalled();
  });
});
