import { AccountSchema, BillDetailSchema, type CreditCardBill } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import {
  billProgress,
  dueLabel,
  eligibleBillsForCardPayment,
  eligiblePaymentAccounts,
  nextBillAction
} from "./bill-presentation";

const bill: CreditCardBill = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66be02",
  cycleStart: new Date("2026-06-26T00:00:00.000Z"),
  cycleEnd: new Date("2026-07-25T00:00:00.000Z"),
  dueDate: new Date("2026-08-15T00:00:00.000Z"),
  amountDueMinor: 10_000,
  reconciliationStatus: "awaiting_statement",
  paidMinor: 2_500,
  remainingMinor: 7_500,
  paymentStatus: "partial",
  createdAt: new Date("2026-07-25T00:00:00.000Z"),
  updatedAt: new Date("2026-07-25T00:00:00.000Z")
};

const card = AccountSchema.parse({
  id: bill.accountId,
  userId: "user-1",
  name: "HDFC Card",
  type: "credit_card",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: -10_000,
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
});

describe("bill presentation", () => {
  it("derives IST due labels and integer progress", () => {
    expect(dueLabel(bill, new Date("2026-08-15T10:00:00.000Z"))).toBe("Due today");
    expect(dueLabel(bill, new Date("2026-08-16T10:00:00.000Z"))).toBe("1 day overdue");
    expect(billProgress(bill)).toBe(25);
  });

  it("derives the next server-controlled action", () => {
    const detail = BillDetailSchema.parse({
      bill,
      account: card,
      reconciliation: {
        stats: { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 },
        unresolved: 0,
        canReconcile: false,
        extraTransactions: []
      }
    });
    expect(nextBillAction(detail)).toBe("upload");
  });

  it("keeps only backend-approved active payment sources", () => {
    const bank = AccountSchema.parse({
      ...card,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be03",
      type: "bank"
    });
    const otherCard = AccountSchema.parse({
      ...card,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be04"
    });
    expect(
      eligiblePaymentAccounts([card, bank, otherCard], card.id).map((item) => item.id)
    ).toEqual([bank.id]);
  });

  it("offers the selected card's open bills that can absorb the full payment", () => {
    const paidOff: CreditCardBill = {
      ...bill,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be05",
      remainingMinor: 0,
      paymentStatus: "paid"
    };
    const ownAccountBill: CreditCardBill = {
      ...bill,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be06",
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66be07"
    };
    const tooSmall: CreditCardBill = {
      ...bill,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be08",
      remainingMinor: 999
    };
    expect(
      eligibleBillsForCardPayment(
        [bill, paidOff, ownAccountBill, tooSmall],
        bill.accountId,
        1_000
      ).map((item) => item.id)
    ).toEqual([bill.id]);
  });
});
