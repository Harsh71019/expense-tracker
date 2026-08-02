import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecurringReconciliationReviewItem, Transaction } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReconciliationReviewCard } from "./reconciliation-review-card";

const mocks = vi.hoisted(
  (): {
    mutate: ReturnType<typeof vi.fn>;
    isPending: boolean;
    isError: boolean;
    error: Error | null;
  } => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null
  })
);

vi.mock("../hooks/use-recurring-reconciliations", () => ({
  useResolveRecurringReconciliation: () => ({
    mutate: mocks.mutate,
    isPending: mocks.isPending,
    isError: mocks.isError,
    error: mocks.error
  })
}));

const timestamp = new Date("2026-08-01T00:00:00.000Z");

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    userId: "user-1",
    accountId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
    type: "expense",
    amountMinor: 200_000,
    currency: "INR",
    occurredAt: timestamp,
    description: "Claude subscription",
    tags: [],
    source: "api",
    status: "posted",
    paymentRail: "unknown",
    counterpartyHandle: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

const incoming = transaction({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
  description: "SWIGGY*BANGALORE"
});
const candidateA = transaction({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be02",
  description: "Claude subscription",
  source: "recurring"
});
const candidateB = transaction({
  id: "3fa85f64-5717-4562-b3fc-2c963f66be03",
  description: "Netflix subscription",
  source: "recurring"
});

function reconciliation(
  overrides: Partial<RecurringReconciliationReviewItem>
): RecurringReconciliationReviewItem {
  return {
    id: "3fa85f64-5717-4562-b3fc-2c963f66be10",
    userId: "user-1",
    incomingTransactionId: incoming.id,
    candidateRecurringTransactionIds: [candidateA.id],
    status: "amount_mismatch",
    createdAt: timestamp,
    updatedAt: timestamp,
    incomingTransaction: incoming,
    candidateTransactions: [candidateA],
    ...overrides
  };
}

describe("ReconciliationReviewCard", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.isPending = false;
    mocks.isError = false;
    mocks.error = null;
  });

  it("shows the incoming and candidate transactions with an amount-mismatch label", () => {
    render(<ReconciliationReviewCard item={reconciliation({})} onResolved={vi.fn()} />);

    expect(screen.getByText("Amount doesn't match")).toBeVisible();
    expect(screen.getByText("SWIGGY*BANGALORE")).toBeVisible();
    expect(screen.getByText("Claude subscription")).toBeVisible();
  });

  it("lets a single-candidate mismatch be confirmed without a candidate picker", async () => {
    const user = userEvent.setup();
    render(<ReconciliationReviewCard item={reconciliation({})} onResolved={vi.fn()} />);

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Yes, same charge" });
    expect(confirm).toBeEnabled();

    await user.click(confirm);
    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: reconciliation({}).id, resolution: "confirmed_duplicate" },
      expect.objectContaining({})
    );
  });

  it("disables confirming a duplicate on an ambiguous row until a candidate is chosen", async () => {
    const user = userEvent.setup();
    const item = reconciliation({
      status: "ambiguous",
      candidateRecurringTransactionIds: [candidateA.id, candidateB.id],
      candidateTransactions: [candidateA, candidateB]
    });
    render(<ReconciliationReviewCard item={item} onResolved={vi.fn()} />);

    expect(screen.getByText("Possible duplicate")).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Yes, same charge" });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByText("Netflix subscription"));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        id: item.id,
        resolution: "confirmed_duplicate",
        chosenRecurringTransactionId: candidateB.id
      },
      expect.objectContaining({})
    );
  });

  it("resolves as distinct without a chosen candidate", async () => {
    const user = userEvent.setup();
    const item = reconciliation({
      status: "ambiguous",
      candidateRecurringTransactionIds: [candidateA.id, candidateB.id],
      candidateTransactions: [candidateA, candidateB]
    });
    render(<ReconciliationReviewCard item={item} onResolved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "No, separate charges" }));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: item.id, resolution: "confirmed_distinct" },
      expect.objectContaining({})
    );
  });

  it("shows an inline error on failure", () => {
    mocks.isError = true;
    mocks.error = new Error("Server is unavailable");
    render(<ReconciliationReviewCard item={reconciliation({})} onResolved={vi.fn()} />);

    expect(screen.getByText("Server is unavailable")).toBeVisible();
  });

  it("calls onResolved when the mutation succeeds", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    const item = reconciliation({});
    mocks.mutate.mockImplementation(
      (_vars: unknown, options?: { onSuccess?: () => void }): void => {
        options?.onSuccess?.();
      }
    );
    render(<ReconciliationReviewCard item={item} onResolved={onResolved} />);

    await user.click(screen.getByRole("button", { name: "No, separate charges" }));
    expect(onResolved).toHaveBeenCalledWith(item.id);
  });
});
