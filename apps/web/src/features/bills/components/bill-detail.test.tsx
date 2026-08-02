import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSchema, BillDetailSchema } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { BillDetail } from "./bill-detail";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  pay: vi.fn(),
  reconcile: vi.fn()
}));

vi.mock("../hooks/use-bill-detail", () => ({
  useBillDetail: (_billId: string, initialData: unknown) => ({
    data: initialData,
    isError: false
  })
}));
vi.mock("../hooks/use-bill-statement", () => ({
  useUploadBillStatement: () => ({ mutateAsync: mocks.upload, isPending: false }),
  useBillStatementRows: () => ({
    data: { pages: [{ items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } }] },
    isPending: false,
    isError: false,
    hasNextPage: false
  })
}));
vi.mock("../hooks/use-pay-bill", () => ({
  usePayBill: () => ({ mutateAsync: mocks.pay, isPending: false })
}));
vi.mock("../hooks/use-bill-reconciliation", () => ({
  useReconcileBill: () => ({ mutateAsync: mocks.reconcile, isPending: false }),
  useAcknowledgeExtraTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBillStatementRow: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

const timestamp = new Date("2026-07-25T00:00:00.000Z");
const card = AccountSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
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
const bank = AccountSchema.parse({
  ...card,
  id: "3fa85f64-5717-4562-b3fc-2c963f66be03",
  name: "HDFC Bank",
  type: "bank",
  balanceMinor: 50_000
});
const base = {
  bill: {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    userId: "user-1",
    accountId: card.id,
    cycleStart: new Date("2026-06-26T00:00:00.000Z"),
    cycleEnd: timestamp,
    dueDate: new Date("2026-08-15T00:00:00.000Z"),
    amountDueMinor: 10_000,
    reconciliationStatus: "awaiting_statement",
    paidMinor: 0,
    remainingMinor: 10_000,
    paymentStatus: "unpaid",
    createdAt: timestamp,
    updatedAt: timestamp
  },
  account: card,
  reconciliation: {
    stats: { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 },
    unresolved: 0,
    canReconcile: false,
    extraTransactions: []
  }
};

describe("BillDetail", () => {
  it("starts with the statement upload hard gate", () => {
    const detail = BillDetailSchema.parse(base);
    render(<BillDetail initialDetail={detail} accounts={[card, bank]} />);
    expect(screen.getByRole("heading", { name: "Upload issuer statement" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Pay remaining bill" })).toBeNull();
  });

  it("unlocks the payment sheet only after reconciliation", async () => {
    const user = userEvent.setup();
    const detail = BillDetailSchema.parse({
      ...base,
      bill: { ...base.bill, reconciliationStatus: "reconciled" },
      activeStatement: {
        id: "3fa85f64-5717-4562-b3fc-2c963f66be05",
        userId: "user-1",
        billId: base.bill.id,
        filename: "card.csv",
        fileHash: "hash",
        mapping: {
          date: "Date",
          description: "Description",
          dateFormat: "DD/MM/YYYY",
          amountConvention: "single_signed",
          amount: "Amount"
        },
        status: "staged",
        active: true,
        stats: { total: 1, matched: 1, missing: 0, ambiguous: 0, acknowledged: 0 },
        acknowledgedExtraTransactionIds: [],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    });
    render(<BillDetail initialDetail={detail} accounts={[card, bank]} />);

    await user.click(screen.getByRole("button", { name: "Pay remaining bill" }));
    expect(screen.getByRole("dialog", { name: "Pay credit card bill" })).toBeVisible();
    expect(screen.getByText("Destination: HDFC Card")).toBeVisible();
    await user.click(screen.getByRole("combobox", { name: "Pay from" }));
    expect(screen.getByRole("option", { name: "HDFC Bank" })).toBeVisible();
  });
});
