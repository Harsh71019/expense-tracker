import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import {
  AccountSchema,
  BillDetailSchema,
  BillPaymentResultSchema,
  BillStatementRowPageSchema,
  BillStatementUploadSchema,
  type BillPage,
  type ColumnMapping
} from "@treasury-ops/shared";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBillDetail } from "./use-bill-detail";
import { useReconcileBill } from "./use-bill-reconciliation";
import { useBillStatementRows, useUploadBillStatement } from "./use-bill-statement";
import { useBills } from "./use-bills";
import { usePayBill } from "./use-pay-bill";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), PATCH: vi.fn(), POST: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: mocks }));

const response = new Response(null, { status: 200 });
const timestamp = new Date("2026-07-25T00:00:00.000Z");
const billId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
const cardId = "3fa85f64-5717-4562-b3fc-2c963f66be02";
const bankId = "3fa85f64-5717-4562-b3fc-2c963f66be03";
const transactionId = "3fa85f64-5717-4562-b3fc-2c963f66be04";
const uploadId = "3fa85f64-5717-4562-b3fc-2c963f66be05";
const rowId = "3fa85f64-5717-4562-b3fc-2c963f66be06";
const mapping: ColumnMapping = {
  date: "Date",
  description: "Description",
  dateFormat: "DD/MM/YYYY",
  amountConvention: "single_signed",
  amount: "Amount"
};
const card = AccountSchema.parse({
  id: cardId,
  userId: "user-1",
  name: "HDFC Card",
  type: "credit_card",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: -10_000,
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
});
const detail = BillDetailSchema.parse({
  bill: {
    id: billId,
    userId: "user-1",
    accountId: cardId,
    cycleStart: new Date("2026-06-26T00:00:00.000Z"),
    cycleEnd: timestamp,
    dueDate: new Date("2026-08-15T00:00:00.000Z"),
    amountDueMinor: 10_000,
    reconciliationStatus: "reconciled",
    paidMinor: 0,
    remainingMinor: 10_000,
    paymentStatus: "unpaid",
    createdAt: timestamp,
    updatedAt: timestamp
  },
  account: card,
  activeStatement: {
    id: uploadId,
    userId: "user-1",
    billId,
    filename: "card.csv",
    fileHash: "hash",
    mapping,
    status: "staged",
    active: true,
    stats: { total: 1, matched: 1, missing: 0, ambiguous: 0, acknowledged: 0 },
    acknowledgedExtraTransactionIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  },
  reconciliation: {
    stats: { total: 1, matched: 1, missing: 0, ambiguous: 0, acknowledged: 0 },
    unresolved: 0,
    canReconcile: true,
    extraTransactions: []
  }
});
const page: BillPage = {
  items: [detail.bill],
  pageInfo: { nextCursor: "next", hasMore: true, limit: 10 }
};
const rowPage = BillStatementRowPageSchema.parse({
  items: [
    {
      id: rowId,
      userId: "user-1",
      uploadId,
      rowNumber: 1,
      raw: { Date: "25/07/2026" },
      parsed: {
        occurredAt: timestamp,
        amountMinor: 10_000,
        type: "expense",
        description: "Groceries"
      },
      matchedTransactionId: transactionId,
      matchStatus: "matched",
      acknowledged: false,
      problems: [],
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
});
const payment = BillPaymentResultSchema.parse({
  bill: { ...detail.bill, paidMinor: 10_000, remainingMinor: 0, paymentStatus: "paid" },
  transfer: {
    transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be07",
    fromTransaction: {
      id: transactionId,
      userId: "user-1",
      accountId: bankId,
      type: "expense",
      amountMinor: 10_000,
      occurredAt: timestamp,
      description: "Credit card bill payment",
      tags: ["credit-card-bill"],
      currency: "INR",
      source: "manual",
      status: "posted",
      paymentRail: "unknown",
      counterpartyHandle: null,
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be07",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    toTransaction: {
      id: "3fa85f64-5717-4562-b3fc-2c963f66be08",
      userId: "user-1",
      accountId: cardId,
      type: "income",
      amountMinor: 10_000,
      occurredAt: timestamp,
      description: "Credit card bill payment",
      tags: ["credit-card-bill"],
      currency: "INR",
      source: "manual",
      status: "posted",
      paymentRail: "unknown",
      counterpartyHandle: null,
      transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be07",
      billId,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  }
});

function wrapper({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

describe("bill data hooks", () => {
  beforeEach(() => {
    mocks.GET.mockReset();
    mocks.PATCH.mockReset();
    mocks.POST.mockReset();
  });

  it("propagates list and statement-row cursors through generated GET calls", async () => {
    mocks.GET.mockResolvedValueOnce({
      data: { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 10 } },
      response
    }).mockResolvedValueOnce({ data: rowPage, response });
    const bills = renderHook(() => useBills({ limit: 10 }, page), { wrapper });
    const rows = renderHook(
      () => useBillStatementRows(billId, { matchStatus: "matched", limit: 50 }, true),
      { wrapper }
    );

    await bills.result.current.fetchNextPage();
    await waitFor(() => expect(rows.result.current.isSuccess).toBe(true));
    expect(mocks.GET).toHaveBeenCalledWith("/v1/bills", {
      params: { query: { cursor: "next", limit: 10 } }
    });
    expect(mocks.GET).toHaveBeenCalledWith("/v1/bills/{billId}/statement/rows", {
      params: {
        path: { billId },
        query: { matchStatus: "matched", limit: 50 }
      }
    });
  });

  it("runtime-validates bill detail responses", async () => {
    mocks.GET.mockResolvedValue({ data: { id: "wrong-shape" }, response });
    const hook = renderHook(() => useBillDetail(billId, detail), { wrapper });
    await expect(hook.result.current.refetch()).resolves.toMatchObject({ isError: true });
  });

  it("uploads FormData through the generated client without direct fetch", async () => {
    const uploadResponse = BillStatementUploadSchema.parse(detail.activeStatement);
    mocks.POST.mockResolvedValue({ data: uploadResponse, response });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const hook = renderHook(() => useUploadBillStatement(billId), { wrapper });
    const file = new File(["Date,Description,Amount"], "card.csv", { type: "text/csv" });

    await expect(hook.result.current.mutateAsync({ file, mapping })).resolves.toMatchObject({
      id: uploadId
    });
    const options = mocks.POST.mock.calls[0]?.[1];
    expect(options?.params.path).toEqual({ billId });
    expect(options?.params.header["Idempotency-Key"]).toEqual(expect.any(String));
    const serialized = options?.bodySerializer();
    expect(serialized).toBeInstanceOf(FormData);
    expect(serialized?.get("file")).toBe(file);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps an idempotency key after failure and rotates it after success", async () => {
    mocks.POST.mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: payment, response })
      .mockResolvedValueOnce({ data: payment, response });
    const hook = renderHook(() => usePayBill(billId), { wrapper });
    const input = { fromAccountId: bankId, amountMinor: 10_000, occurredAt: timestamp };

    await expect(hook.result.current.mutateAsync(input)).rejects.toThrow("offline");
    await expect(hook.result.current.mutateAsync(input)).resolves.toMatchObject({
      bill: { paymentStatus: "paid" }
    });
    await waitFor(() => expect(mocks.POST).toHaveBeenCalledTimes(2));
    const failedKey = mocks.POST.mock.calls[0]?.[1]?.params.header["Idempotency-Key"];
    const successfulKey = mocks.POST.mock.calls[1]?.[1]?.params.header["Idempotency-Key"];
    expect(successfulKey).toBe(failedKey);

    await hook.result.current.mutateAsync(input);
    const rotatedKey = mocks.POST.mock.calls[2]?.[1]?.params.header["Idempotency-Key"];
    expect(rotatedKey).not.toBe(successfulKey);
  });

  it("reconciles through the generated mutation and validates the result", async () => {
    mocks.POST.mockResolvedValue({ data: detail.bill, response });
    const hook = renderHook(() => useReconcileBill(billId), { wrapper });
    await expect(hook.result.current.mutateAsync()).resolves.toMatchObject({ id: billId });
    expect(mocks.POST).toHaveBeenCalledWith(
      "/v1/bills/{billId}/statement/reconcile",
      expect.objectContaining({
        params: {
          path: { billId },
          header: { "Idempotency-Key": expect.any(String) }
        }
      })
    );
  });
});
