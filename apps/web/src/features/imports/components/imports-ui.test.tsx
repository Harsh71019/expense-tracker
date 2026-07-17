import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ImportBatchActions } from "./import-batch-actions";
import { ImportBatchList } from "./import-batch-list";
import { ImportBatchStatus } from "./import-batch-status";
import { MappingForm } from "./mapping-form";
import { StagedRow } from "./staged-row";
import { StagedRowTable } from "./staged-row-table";
import { UploadForm } from "./upload-form";

const mocks = vi.hoisted(() => ({
  accounts: [{ id: "507f1f77bcf86cd799439011", name: "HDFC", isArchived: false }],
  accountsLoading: false,
  categories: [
    { id: "507f1f77bcf86cd799439012", name: "Food", kind: "expense", isArchived: false }
  ],
  upload: vi.fn(),
  update: vi.fn(),
  commit: vi.fn(),
  revert: vi.fn(),
  push: vi.fn()
}));

vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: mocks.accounts, isLoading: mocks.accountsLoading })
}));
vi.mock("@/features/categories", () => ({
  useCategories: () => ({ data: mocks.categories })
}));
vi.mock("../hooks/use-upload-import", () => ({
  useUploadImport: () => ({ mutateAsync: mocks.upload, isPending: false })
}));
vi.mock("../hooks/use-saved-import-mapping", () => ({
  useSavedImportMapping: () => ({ data: undefined, isLoading: false, isError: false })
}));
vi.mock("../hooks/use-update-staged-row", () => ({
  useUpdateStagedRow: () => ({ mutate: mocks.update, isPending: false })
}));
vi.mock("../hooks/use-commit-batch", () => ({
  useCommitBatch: () => ({ mutateAsync: mocks.commit, isPending: false })
}));
vi.mock("../hooks/use-revert-batch", () => ({
  useRevertBatch: () => ({ mutateAsync: mocks.revert, isPending: false })
}));
vi.mock("../hooks/use-import-batches", () => ({
  useImportBatches: () => ({ data: undefined, isError: false })
}));
vi.mock("../hooks/use-staged-rows", () => ({
  useStagedRows: () => ({ data: undefined, hasNextPage: false, isError: false })
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

const batch = {
  id: "507f1f77bcf86cd799439013",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439011",
  filename: "hdfc.csv",
  fileHash: "hash",
  mapping: {
    date: "Date",
    description: "Narration",
    dateFormat: "DD/MM/YYYY" as const,
    amountConvention: "single_signed" as const,
    amount: "Amount"
  },
  status: "staged" as const,
  stats: { total: 2, staged: 1, duplicates: 1, committed: 0 },
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("imports UI", () => {
  beforeEach(() => {
    mocks.upload.mockReset();
    mocks.update.mockReset();
    mocks.commit.mockReset();
    mocks.revert.mockReset();
    mocks.push.mockReset();
    mocks.accountsLoading = false;
    mocks.accounts.splice(0, mocks.accounts.length, {
      id: "507f1f77bcf86cd799439011",
      name: "HDFC",
      isArchived: false
    });
  });

  it("requires a complete mapping and switches amount fields by convention", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MappingForm onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Date column"), "Date");
    await user.type(screen.getByLabelText("Description column"), "Narration");
    await user.selectOptions(screen.getByLabelText("Date format"), "DD/MM/YYYY");
    await user.type(screen.getByLabelText("Amount column"), "Amount");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: "Amount" }),
      undefined
    );
    await user.selectOptions(screen.getByLabelText("Amount convention"), "debit_credit_cols");
    expect(screen.queryByLabelText("Amount column")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Debit column")).toBeVisible();
  });

  it("disables malformed rows and flags problems and duplicates", async () => {
    const user = userEvent.setup();
    render(
      <StagedRow
        batchId={batch.id}
        row={{
          id: "507f1f77bcf86cd799439014",
          batchId: batch.id,
          rowNumber: 4,
          raw: { Date: "bad" },
          problems: ["Invalid date"],
          isDuplicate: true,
          include: false
        }}
      />
    );
    expect(screen.getByText("Duplicate")).toBeVisible();
    expect(screen.getByText("Invalid date")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Include" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Include" }));
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("persists include and category selections for parsed rows", async () => {
    const user = userEvent.setup();
    render(
      <StagedRow
        batchId={batch.id}
        row={{
          id: "507f1f77bcf86cd799439014",
          batchId: batch.id,
          rowNumber: 5,
          raw: {},
          parsed: {
            occurredAt: new Date("2026-07-01T00:00:00.000Z"),
            amountMinor: 2500,
            type: "expense",
            description: "Lunch"
          },
          problems: [],
          isDuplicate: false,
          include: true
        }}
      />
    );
    await user.click(screen.getByRole("checkbox", { name: "Include" }));
    expect(mocks.update).toHaveBeenCalledWith({
      batchId: batch.id,
      stagedRowId: "507f1f77bcf86cd799439014",
      include: false
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Category for row 5" }),
      "507f1f77bcf86cd799439012"
    );
    expect(mocks.update).toHaveBeenLastCalledWith({
      batchId: batch.id,
      stagedRowId: "507f1f77bcf86cd799439014",
      suggestedCategoryId: "507f1f77bcf86cd799439012"
    });
    expect(screen.getByText("−₹25.00")).toBeVisible();
  });

  it("only exposes valid batch actions and confirms them", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.commit.mockResolvedValue(batch);
    const { rerender } = render(<ImportBatchActions batch={batch} />);
    await user.click(screen.getByRole("button", { name: "Commit import" }));
    expect(mocks.commit).toHaveBeenCalledWith(batch.id);
    rerender(<ImportBatchActions batch={{ ...batch, status: "committed" }} />);
    expect(screen.queryByRole("button", { name: "Commit import" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revert batch" })).toBeVisible();
    confirm.mockRestore();
  });

  it("renders all status mappings and the upload account setup", () => {
    render(
      <>
        <ImportBatchStatus status="pending" />
        <ImportBatchStatus status="committed" />
        <ImportBatchStatus status="reverted" />
        <ImportBatchStatus status="failed" />
        <UploadForm />
      </>
    );
    expect(screen.getByText("Parsing")).toBeVisible();
    expect(screen.getByText("Committed")).toBeVisible();
    expect(screen.getByText("Reverted")).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
    expect(screen.getByLabelText("Import to account")).toBeVisible();
  });

  it("handles account setup, loading, validation, and successful uploads", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<UploadForm />);
    await user.click(screen.getByRole("button", { name: "Upload and review" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a file");
    mocks.accountsLoading = true;
    rerender(<UploadForm />);
    expect(screen.getByText("Loading accounts…")).toBeVisible();
    mocks.accountsLoading = false;
    mocks.accounts.splice(0);
    rerender(<UploadForm />);
    expect(screen.getByRole("heading", { name: "Create an account first" })).toBeVisible();
    mocks.accounts.push({ id: "507f1f77bcf86cd799439011", name: "HDFC", isArchived: false });
    rerender(<UploadForm />);
    const fileInput = container.querySelector("input[type=file]");
    if (!(fileInput instanceof HTMLInputElement)) throw new Error("Expected a file input.");
    await user.upload(fileInput, new File(["Date"], "hdfc.csv", { type: "text/csv" }));
    await user.selectOptions(
      screen.getByLabelText("Import to account"),
      "507f1f77bcf86cd799439011"
    );
    await user.type(screen.getByLabelText("Date column"), "Date");
    await user.type(screen.getByLabelText("Description column"), "Narration");
    await user.selectOptions(screen.getByLabelText("Date format"), "DD/MM/YYYY");
    await user.type(screen.getByLabelText("Amount column"), "Amount");
    mocks.upload.mockResolvedValue(batch);
    await user.click(screen.getByRole("button", { name: "Upload and review" }));
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "507f1f77bcf86cd799439011" })
    );
    expect(mocks.push).toHaveBeenCalledWith(`/imports/${batch.id}`);
  });

  it("lists batches and renders staged rows from their paginated data", () => {
    const page = {
      items: [
        {
          id: "507f1f77bcf86cd799439014",
          batchId: batch.id,
          rowNumber: 1,
          raw: {},
          parsed: {
            occurredAt: new Date("2026-07-01T00:00:00.000Z"),
            amountMinor: 100,
            type: "expense" as const,
            description: "Tea"
          },
          problems: [],
          isDuplicate: false,
          include: true
        }
      ],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    };
    render(
      <>
        <ImportBatchList initialBatches={[batch]} />
        <StagedRowTable batchId={batch.id} initialPage={page} />
      </>
    );
    expect(screen.getByRole("link", { name: /hdfc.csv/i })).toHaveAttribute(
      "href",
      `/imports/${batch.id}`
    );
    expect(screen.getByText("Tea")).toBeVisible();
  });
});
