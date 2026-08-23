import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PortfolioImportBatch } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PortfolioImportWizard } from "./portfolio-import-wizard";

type MockState = {
  batch: PortfolioImportBatch | undefined;
  deleteMutateAsync: ReturnType<typeof vi.fn>;
  toastSuccess: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted<MockState>(() => ({
  batch: undefined,
  deleteMutateAsync: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock("../hooks/use-portfolio-imports", () => ({
  usePortfolioImportBatches: () => ({ data: mocks.batch === undefined ? [] : [mocks.batch] }),
  usePortfolioImportBatch: () => ({ data: undefined }),
  usePortfolioImportRows: () => ({ data: undefined }),
  useUploadPortfolioImport: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdatePortfolioImportRow: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useCommitPortfolioImportBatch: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeletePortfolioImportBatch: () => ({
    isPending: false,
    mutateAsync: mocks.deleteMutateAsync
  }),
  useRevertPortfolioImportBatch: () => ({ isPending: false, mutateAsync: vi.fn() })
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() }
}));

function batch(status: PortfolioImportBatch["status"]): PortfolioImportBatch {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
    userId: "user-1",
    source: "kfintech_cams",
    filename: "cas.pdf",
    fileHash: "a".repeat(64),
    status,
    rowCount: 0,
    includedCount: 0,
    warningCount: 0,
    errorCount: 0,
    createdAt: new Date("2026-08-23T17:00:00.000Z"),
    updatedAt: new Date("2026-08-23T17:00:00.000Z")
  };
}

describe("PortfolioImportWizard delete action", () => {
  beforeEach(() => {
    mocks.batch = undefined;
    mocks.deleteMutateAsync.mockReset().mockResolvedValue(undefined);
    mocks.toastSuccess.mockReset();
  });

  it("deletes a stuck parsing import after confirmation", async () => {
    const user = userEvent.setup();
    mocks.batch = batch("parsing");
    render(<PortfolioImportWizard userAssets={[]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete this CAS import?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete import" }));

    await waitFor(() => expect(mocks.deleteMutateAsync).toHaveBeenCalledWith(mocks.batch?.id));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Statement deleted. You can upload it again now."
    );
  });

  it("does not offer deletion for a completed import", () => {
    mocks.batch = batch("completed");
    render(<PortfolioImportWizard userAssets={[]} />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revert" })).toBeVisible();
  });
});
