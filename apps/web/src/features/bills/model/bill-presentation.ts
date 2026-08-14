import type { Account, BillDetail, CreditCardBill } from "@treasury-ops/shared";

export type BillAction = "upload" | "processing" | "resolve" | "reconcile" | "pay" | "complete";

const dayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric"
});

function istDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function utcDay(date: Date): number {
  const [year, month, day] = istDateKey(date).split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError("Could not format the calendar date.");
  }
  return Date.UTC(year, month - 1, day);
}

export function formatBillDate(date: Date): string {
  return dayFormatter.format(date);
}

export function dueLabel(bill: CreditCardBill, now = new Date()): string {
  if (bill.paymentStatus === "paid") return "Paid";
  const days = Math.round((utcDay(bill.dueDate) - utcDay(now)) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export function billProgress(bill: CreditCardBill): number {
  if (bill.amountDueMinor === 0) return 100;
  return Math.min(100, Math.max(0, Math.round((bill.paidMinor * 100) / bill.amountDueMinor)));
}

export function nextBillAction(detail: BillDetail): BillAction {
  const { bill, activeStatement, reconciliation } = detail;
  if (bill.paymentStatus === "paid") return "complete";
  if (bill.reconciliationStatus === "reconciled") return "pay";
  if (activeStatement === undefined || activeStatement.status === "failed") return "upload";
  if (activeStatement.status === "pending") return "processing";
  if (reconciliation.unresolved > 0) return "resolve";
  return "reconcile";
}

export function eligiblePaymentAccounts(
  accounts: readonly Account[],
  cardAccountId: string
): Account[] {
  return accounts.filter(
    (account) =>
      !account.isArchived &&
      account.id !== cardAccountId &&
      (account.type === "bank" || account.type === "cash" || account.type === "wallet")
  );
}

export function eligibleBillsForCardPayment(
  bills: readonly CreditCardBill[],
  creditCardAccountId: string,
  amountMinor: number
): CreditCardBill[] {
  return bills
    .filter(
      (bill) =>
        bill.accountId === creditCardAccountId &&
        bill.remainingMinor > 0 &&
        bill.remainingMinor >= amountMinor
    )
    .toSorted((left, right) => left.dueDate.getTime() - right.dueDate.getTime());
}

export const actionLabel: Readonly<Record<BillAction, string>> = {
  upload: "Upload statement",
  processing: "Processing statement",
  resolve: "Review mismatches",
  reconcile: "Reconcile statement",
  pay: "Pay bill",
  complete: "Paid in full"
};
