import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AccountSchema,
  BillDetailSchema,
  BillStatementRowSchema,
  BillStatementUploadSchema,
  TransactionSchema
} from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExtraLedgerList } from "./extra-ledger-list";
import { PayBillSheet } from "./pay-bill-sheet";
import { ReconcileConfirmDialog } from "./reconcile-confirm-dialog";
import { ReconciliationRow } from "./reconciliation-row";
import { StatementUploadStep } from "./statement-upload-step";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  acknowledgeExtra: vi.fn(),
  reconcile: vi.fn(),
  upload: vi.fn(),
  pay: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-bill-reconciliation", () => ({
  useUpdateBillStatementRow: () => ({ mutateAsync: mocks.update, isPending: false }),
  useAcknowledgeExtraTransaction: () => ({
    mutateAsync: mocks.acknowledgeExtra,
    isPending: false
  }),
  useReconcileBill: () => ({ mutateAsync: mocks.reconcile, isPending: false })
}));
vi.mock("../hooks/use-bill-statement", () => ({
  useUploadBillStatement: () => ({ mutateAsync: mocks.upload, isPending: false })
}));
vi.mock("../hooks/use-pay-bill", () => ({
  usePayBill: () => ({ mutateAsync: mocks.pay, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const timestamp = new Date("2026-07-25T00:00:00.000Z");
const billId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
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
const detail = BillDetailSchema.parse({
  bill: {
    id: billId,
    userId: "user-1",
    accountId: card.id,
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
    id: "3fa85f64-5717-4562-b3fc-2c963f66be05",
    userId: "user-1",
    billId,
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
  },
  reconciliation: {
    stats: { total: 1, matched: 1, missing: 0, ambiguous: 0, acknowledged: 0 },
    unresolved: 0,
    canReconcile: true,
    extraTransactions: []
  }
});
const transaction = TransactionSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be04",
  userId: "user-1",
  accountId: card.id,
  type: "expense",
  amountMinor: 10_000,
  occurredAt: timestamp,
  description: "Groceries",
  tags: [],
  currency: "INR",
  source: "manual",
  status: "posted",
  createdAt: timestamp,
  updatedAt: timestamp
});
const row = BillStatementRowSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be06",
  userId: "user-1",
  uploadId: detail.activeStatement?.id,
  rowNumber: 1,
  raw: { Date: "25/07/2026" },
  parsed: {
    occurredAt: timestamp,
    amountMinor: 10_000,
    type: "expense",
    description: "Groceries"
  },
  matchStatus: "ambiguous",
  acknowledged: false,
  problems: [],
  createdAt: timestamp,
  updatedAt: timestamp
});

describe("bill actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("manually matches or acknowledges an unresolved issuer row", async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(row);
    const { rerender } = render(
      <ReconciliationRow billId={billId} row={row} candidates={[transaction]} readOnly={false} />
    );
    await user.click(screen.getByRole("button", { name: "Match" }));
    expect(mocks.update).toHaveBeenCalledWith({
      rowId: row.id,
      patch: { matchedTransactionId: transaction.id }
    });

    rerender(
      <ReconciliationRow
        billId={billId}
        row={{ ...row, matchStatus: "missing_from_ledger" }}
        candidates={[]}
        readOnly={false}
      />
    );
    await user.click(screen.getByRole("button", { name: "Acknowledge row 1" }));
    expect(mocks.update).toHaveBeenLastCalledWith({
      rowId: row.id,
      patch: { acknowledged: true }
    });
  });

  it("marks extra ledger warnings reviewed", async () => {
    const user = userEvent.setup();
    const upload = BillStatementUploadSchema.parse(detail.activeStatement);
    mocks.acknowledgeExtra.mockResolvedValue(upload);
    render(
      <ExtraLedgerList
        billId={billId}
        upload={upload}
        transactions={[transaction]}
        readOnly={false}
      />
    );
    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect(mocks.acknowledgeExtra).toHaveBeenCalledWith({
      transactionId: transaction.id,
      acknowledged: true
    });
  });

  it("uploads a mapped CSV statement", async () => {
    const user = userEvent.setup();
    mocks.upload.mockResolvedValue(detail.activeStatement);
    render(<StatementUploadStep billId={billId} />);
    const file = new File(["Date,Narration,Amount"], "card.csv", { type: "text/csv" });
    await user.upload(screen.getByLabelText(/Choose a card statement CSV/), file);
    await user.click(screen.getByRole("button", { name: "HDFC" }));
    const submit = screen.getByRole("button", { name: "Upload and verify" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() =>
      expect(mocks.upload).toHaveBeenCalledWith({
        file,
        mapping: expect.objectContaining({ dateFormat: "DD/MM/YYYY" })
      })
    );
  });

  it("confirms reconciliation and a full payment", async () => {
    const user = userEvent.setup();
    const closeReconcile = vi.fn();
    mocks.reconcile.mockResolvedValue(detail.bill);
    const { unmount } = render(<ReconcileConfirmDialog detail={detail} onClose={closeReconcile} />);
    expect(screen.getByRole("dialog", { name: "Mark statement reconciled?" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close reconciliation" })).toHaveClass(
      "h-11",
      "w-11"
    );
    await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    await waitFor(() => expect(closeReconcile).toHaveBeenCalledOnce());
    unmount();

    const closePayment = vi.fn();
    mocks.pay.mockResolvedValue({
      bill: { ...detail.bill, paymentStatus: "paid", paidMinor: 10_000, remainingMinor: 0 }
    });
    render(<PayBillSheet detail={detail} accounts={[card, bank]} onClose={closePayment} />);
    expect(screen.getByRole("dialog", { name: "Pay credit card bill" })).toHaveClass("h-dvh");
    expect(screen.getByLabelText("Pay from")).toHaveClass("min-h-11", "text-base");
    await user.click(screen.getByRole("button", { name: "Confirm payment" }));
    await waitFor(() =>
      expect(mocks.pay).toHaveBeenCalledWith({
        fromAccountId: bank.id,
        amountMinor: 10_000,
        occurredAt: expect.any(Date)
      })
    );
    expect(closePayment).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Bill paid in full");
  });
});
