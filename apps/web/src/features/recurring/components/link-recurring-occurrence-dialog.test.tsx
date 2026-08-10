import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TransactionSchema,
  type RecurringOccurrence,
  type RecurringRule
} from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import {
  isLinkableRecurringOccurrenceSource,
  LinkRecurringOccurrenceDialog
} from "./link-recurring-occurrence-dialog";

const mocks = vi.hoisted(() => {
  const outstanding: { data: RecurringOccurrence[] | undefined } = { data: undefined };
  const rules: { data: RecurringRule[] | undefined } = { data: undefined };
  return { link: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn(), outstanding, rules };
});

vi.mock("../hooks/use-outstanding-recurring-occurrences", () => ({
  useOutstandingRecurringOccurrences: () => ({ data: mocks.outstanding.data })
}));
vi.mock("../hooks/use-recurring-rules", () => ({
  useRecurringRules: () => ({ data: mocks.rules.data })
}));
vi.mock("../hooks/use-link-recurring-occurrence", () => ({
  useLinkRecurringOccurrence: () => ({ mutateAsync: mocks.link, isPending: false })
}));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const bankAccountId = "3fa85f64-5717-4562-b3fc-2c963f66be01";
const walletAccountId = "3fa85f64-5717-4562-b3fc-2c963f66be09";
const ruleId = "3fa85f64-5717-4562-b3fc-2c963f66be02";
const occurrenceId = "3fa85f64-5717-4562-b3fc-2c963f66be03";
const timestamp = new Date("2026-07-19T00:00:00.000Z");

const expenseOnBank = TransactionSchema.parse({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be04",
  userId: "user-1",
  accountId: bankAccountId,
  type: "expense",
  amountMinor: 5_000,
  currency: "INR",
  occurredAt: new Date("2026-08-12T00:00:00.000Z"),
  description: "UPI/DR/000000000000/GYM MEMBERSHIP",
  tags: [],
  source: "api",
  status: "posted",
  paymentRail: "upi",
  counterpartyHandle: null,
  createdAt: new Date("2026-08-12T00:00:00.000Z"),
  updatedAt: new Date("2026-08-12T00:00:00.000Z")
});

const rule: RecurringRule = {
  id: ruleId,
  userId: "user-1",
  template: {
    accountId: bankAccountId,
    type: "expense",
    amountMinor: 5_000,
    description: "Gym membership",
    tags: []
  },
  rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
  startAt: timestamp,
  nextRunAt: timestamp,
  isPaused: false,
  autoPost: false,
  createdAt: timestamp,
  updatedAt: timestamp
};

const occurrence: RecurringOccurrence = {
  id: occurrenceId,
  userId: "user-1",
  recurringRuleId: ruleId,
  occurredAt: timestamp,
  status: "expected",
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("isLinkableRecurringOccurrenceSource", () => {
  it("allows a posted transaction with no existing recurring link", () => {
    expect(isLinkableRecurringOccurrenceSource(expenseOnBank)).toBe(true);
  });

  it("rejects a reversed or already-linked transaction", () => {
    expect(isLinkableRecurringOccurrenceSource({ ...expenseOnBank, status: "reversed" })).toBe(
      false
    );
    expect(isLinkableRecurringOccurrenceSource({ ...expenseOnBank, recurringRuleId: ruleId })).toBe(
      false
    );
  });
});

describe("LinkRecurringOccurrenceDialog", () => {
  it("links the transaction to the matching outstanding occurrence", async () => {
    mocks.outstanding.data = [occurrence];
    mocks.rules.data = [rule];
    mocks.link.mockResolvedValue({ ...occurrence, status: "confirmed" });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<LinkRecurringOccurrenceDialog transaction={expenseOnBank} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Link payment" }));

    await waitFor(() =>
      expect(mocks.link).toHaveBeenCalledWith({
        ruleId,
        occurrenceId,
        transactionId: expenseOnBank.id
      })
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Linked to the recurring rule");
  });

  it("excludes occurrences whose rule account or type doesn't match the transaction", () => {
    const otherAccountRule: RecurringRule = {
      ...rule,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be05",
      template: { ...rule.template, accountId: walletAccountId }
    };
    const otherOccurrence: RecurringOccurrence = {
      ...occurrence,
      id: "3fa85f64-5717-4562-b3fc-2c963f66be06",
      recurringRuleId: otherAccountRule.id
    };
    mocks.outstanding.data = [otherOccurrence];
    mocks.rules.data = [otherAccountRule];
    render(<LinkRecurringOccurrenceDialog transaction={expenseOnBank} onClose={vi.fn()} />);
    expect(
      screen.getByText(
        "No outstanding recurring occurrences match this transaction’s account and type."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link payment" })).toBeDisabled();
  });
});
