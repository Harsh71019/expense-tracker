import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSchema, TransactionSchema, type CreditCardBill } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { isLinkableBillPaymentSource, LinkBillPaymentDialog } from "./link-bill-payment-dialog";

const mocks = vi.hoisted(() => {
  const openBills: { data: CreditCardBill[] | undefined } = { data: undefined };
  return {
    link: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    openBills
  };
});

vi.mock("../hooks/use-open-bills", () => ({
  useOpenBills: () => ({ data: mocks.openBills.data, isLoading: false })
}));
vi.mock("../hooks/use-link-bill-payment", () => ({
  useLinkBillPayment: () => ({ mutateAsync: mocks.link, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const bankAccountId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
const cardAccountId = "3fa85f64-5717-4562-b3fc-2c963f66be02";
const billId = "3fa85f64-5717-4562-b3fc-2c963f66be03";

const bank = AccountSchema.parse({
  id: bankAccountId,
  userId: "user-1",
  name: "HDFC Savings",
  type: "bank",
  currency: "INR",
  openingBalanceMinor: 100_000,
  balanceMinor: 100_000,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
});

const card = AccountSchema.parse({
  ...bank,
  id: cardAccountId,
  name: "HDFC Card",
  type: "credit_card",
  balanceMinor: -8_000
});

const expenseOnBank = TransactionSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be04",
  userId: "user-1",
  accountId: bankAccountId,
  type: "expense",
  amountMinor: 3_000,
  currency: "INR",
  occurredAt: new Date("2026-08-12T00:00:00.000Z"),
  description: "UPI/DR/000000000000/CREDIT CARD BILL",
  tags: [],
  source: "api",
  status: "posted",
  paymentRail: "upi",
  counterpartyHandle: null,
  createdAt: new Date("2026-08-12T00:00:00.000Z"),
  updatedAt: new Date("2026-08-12T00:00:00.000Z")
});

const bill: CreditCardBill = {
  id: billId,
  userId: "user-1",
  accountId: cardAccountId,
  cycleStart: new Date("2026-06-26T00:00:00.000Z"),
  cycleEnd: new Date("2026-07-25T00:00:00.000Z"),
  dueDate: new Date("2026-08-15T00:00:00.000Z"),
  amountDueMinor: 8_000,
  reconciliationStatus: "awaiting_statement",
  paidMinor: 0,
  remainingMinor: 8_000,
  paymentStatus: "unpaid",
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

describe("isLinkableBillPaymentSource", () => {
  it("allows a posted expense on a non-credit-card account with no existing link", () => {
    expect(isLinkableBillPaymentSource(expenseOnBank, [bank, card])).toBe(true);
  });

  it("rejects income, reversed, transfer-leg, already-linked, or credit-card-sourced transactions", () => {
    expect(isLinkableBillPaymentSource({ ...expenseOnBank, type: "income" }, [bank, card])).toBe(
      false
    );
    expect(
      isLinkableBillPaymentSource({ ...expenseOnBank, status: "reversed" }, [bank, card])
    ).toBe(false);
    expect(
      isLinkableBillPaymentSource(
        { ...expenseOnBank, transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be05" },
        [bank, card]
      )
    ).toBe(false);
    expect(isLinkableBillPaymentSource({ ...expenseOnBank, billId }, [bank, card])).toBe(false);
    expect(
      isLinkableBillPaymentSource({ ...expenseOnBank, accountId: cardAccountId }, [bank, card])
    ).toBe(false);
  });
});

describe("LinkBillPaymentDialog", () => {
  it("links the transaction to the selected bill for the suggested amount", async () => {
    mocks.openBills.data = [bill];
    mocks.link.mockResolvedValue({
      bill: { ...bill, paidMinor: 3_000, remainingMinor: 5_000, paymentStatus: "partial" },
      transfer: {
        transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be06",
        fromTransaction: expenseOnBank,
        toTransaction: expenseOnBank
      }
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <LinkBillPaymentDialog
        transaction={expenseOnBank}
        accounts={[bank, card]}
        onClose={onClose}
      />
    );

    expect(screen.getByText("₹80.00")).toBeVisible();
    expect(screen.getByText("₹50.00")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm card payment" }));

    await waitFor(() =>
      expect(mocks.link).toHaveBeenCalledWith({
        billId,
        transactionId: expenseOnBank.id,
        creditCardAccountId: cardAccountId
      })
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Card balance and bill payment updated");
  });

  it("updates the card even when there is no generated bill", async () => {
    mocks.openBills.data = [];
    mocks.link.mockResolvedValue({
      transfer: {
        transferGroupId: "3fa85f64-5717-4562-b3fc-2c963f66be06",
        fromTransaction: expenseOnBank,
        toTransaction: expenseOnBank
      }
    });
    const user = userEvent.setup();
    render(
      <LinkBillPaymentDialog
        transaction={expenseOnBank}
        accounts={[bank, card]}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/No matching open bill is required/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm card payment" }));
    await waitFor(() =>
      expect(mocks.link).toHaveBeenCalledWith({
        transactionId: expenseOnBank.id,
        creditCardAccountId: cardAccountId
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Credit card balance updated");
  });

  it("requires an active credit-card account", () => {
    mocks.openBills.data = [];
    render(
      <LinkBillPaymentDialog transaction={expenseOnBank} accounts={[bank]} onClose={vi.fn()} />
    );
    expect(screen.getByText(/Create an active credit-card account/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm card payment" })).toBeDisabled();
  });
});
