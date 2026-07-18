import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useCommitBatch } from "./use-commit-batch";
import { useImportBatches } from "./use-import-batches";
import { useRevertBatch } from "./use-revert-batch";
import { useStagedRows } from "./use-staged-rows";
import { useUpdateStagedRow } from "./use-update-staged-row";
import { useUploadImport } from "./use-upload-import";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), PATCH: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const wrapper = ({ children }: Readonly<{ children: ReactNode }>): ReactNode => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);
const response = new Response(null, { status: 200 });
const problemResponse = new Response(null, { status: 422 });
const timestamp = new Date("2026-07-16T00:00:00.000Z");
const problem = {
  type: "https://vyaya.app/problems/validation",
  title: "Validation failed",
  status: 422,
  detail: "Check import",
  instance: "/api/v1/imports",
  code: "common.validation_failed",
  reqId: "request-1",
  timestamp,
  retryable: false,
  errors: null
};
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
  stats: { total: 1, staged: 1, duplicates: 0, committed: 0 },
  createdAt: timestamp,
  updatedAt: timestamp
};
const row = {
  id: "507f1f77bcf86cd799439014",
  batchId: batch.id,
  rowNumber: 1,
  raw: {},
  parsed: { occurredAt: timestamp, amountMinor: 100, type: "expense" as const, description: "Tea" },
  problems: [],
  isDuplicate: false,
  include: true
};
const page = { items: [row], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };

describe("import data hooks", () => {
  it("loads batches and staged rows through the typed client", async () => {
    mocks.GET.mockImplementation((path: string) =>
      Promise.resolve({ data: path === "/v1/imports" ? [batch] : page, response })
    );
    const batches = renderHook(() => useImportBatches(), { wrapper });
    const rows = renderHook(() => useStagedRows(batch.id, page), { wrapper });
    await waitFor(() => expect(batches.result.current.data?.[0]?.filename).toBe("hdfc.csv"));
    await waitFor(() =>
      expect(rows.result.current.data?.pages[0]?.items[0]?.parsed?.description).toBe("Tea")
    );
    expect(mocks.GET).toHaveBeenCalledWith(
      "/v1/imports/{importBatchId}/preview",
      expect.anything()
    );
  });

  it("patches row fields and commits or reverts batches", async () => {
    mocks.PATCH.mockResolvedValue({ data: row, response });
    mocks.POST.mockResolvedValue({ data: batch, response });
    const update = renderHook(() => useUpdateStagedRow(), { wrapper });
    const commit = renderHook(() => useCommitBatch(), { wrapper });
    const revert = renderHook(() => useRevertBatch(), { wrapper });
    await expect(
      update.result.current.mutateAsync({
        batchId: batch.id,
        stagedRowId: row.id,
        suggestedCategoryId: null
      })
    ).resolves.toMatchObject({ id: row.id });
    await expect(commit.result.current.mutateAsync(batch.id)).resolves.toMatchObject({
      id: batch.id
    });
    await expect(revert.result.current.mutateAsync(batch.id)).resolves.toMatchObject({
      id: batch.id
    });
    expect(mocks.PATCH).toHaveBeenCalledWith(
      "/v1/imports/{importBatchId}/rows/{stagedRowId}",
      expect.objectContaining({ body: { suggestedCategoryId: null } })
    );
    expect(mocks.POST).toHaveBeenCalledWith(
      "/v1/imports/{importBatchId}/commit",
      expect.anything()
    );
    expect(mocks.POST).toHaveBeenCalledWith(
      "/v1/imports/{importBatchId}/revert",
      expect.anything()
    );
  });

  it("uploads multipart form data and validates the returned batch", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(batch), { status: 201 }));
    const upload = renderHook(() => useUploadImport(), { wrapper });
    await expect(
      upload.result.current.mutateAsync({
        file: new File(["Date"], "hdfc.csv", { type: "text/csv" }),
        accountId: batch.accountId,
        mapping: batch.mapping
      })
    ).resolves.toMatchObject({ id: batch.id });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/imports",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    fetchMock.mockRestore();
  });

  it("surfaces API, malformed-response, and transport failures", async () => {
    mocks.GET.mockResolvedValueOnce({ data: undefined, error: problem, response: problemResponse });
    mocks.PATCH.mockResolvedValueOnce({ data: { id: "invalid" }, response });
    mocks.POST.mockRejectedValueOnce("offline");
    const batches = renderHook(() => useImportBatches(), { wrapper });
    const update = renderHook(() => useUpdateStagedRow(), { wrapper });
    const commit = renderHook(() => useCommitBatch(), { wrapper });
    await waitFor(() => expect(batches.result.current.isError).toBe(true));
    await expect(
      update.result.current.mutateAsync({ batchId: batch.id, stagedRowId: row.id, include: false })
    ).rejects.toThrow("The request could not be completed.");
    await expect(commit.result.current.mutateAsync(batch.id)).rejects.toThrow(
      "The network request failed."
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("not-json", { status: 500 }));
    const upload = renderHook(() => useUploadImport(), { wrapper });
    await expect(
      upload.result.current.mutateAsync({
        file: new File(["Date"], "hdfc.csv"),
        accountId: batch.accountId,
        mapping: batch.mapping
      })
    ).rejects.toThrow("The request could not be completed.");
    fetchMock.mockRestore();
  });
});
