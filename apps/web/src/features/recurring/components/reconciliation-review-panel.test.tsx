import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecurringReconciliationReviewItem } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { ReconciliationReviewPanel } from "./reconciliation-review-panel";

vi.mock("../hooks/use-recurring-reconciliations", () => ({
  useRecurringReconciliations: (items: RecurringReconciliationReviewItem[]) => ({
    data: items,
    error: null
  })
}));

let onResolvedCallback: ((id: string) => void) | undefined;
vi.mock("./reconciliation-review-card", () => ({
  ReconciliationReviewCard: ({
    item,
    onResolved
  }: {
    item: RecurringReconciliationReviewItem;
    onResolved: (id: string) => void;
  }) => {
    onResolvedCallback = onResolved;
    return (
      <article>
        {item.incomingTransaction.description}
        <button type="button" onClick={() => onResolved(item.id)}>
          Resolve {item.id}
        </button>
      </article>
    );
  }
}));

const timestamp = new Date("2026-08-01T00:00:00.000Z");

function fixture(id: string, description: string): RecurringReconciliationReviewItem {
  return {
    id,
    userId: "user-1",
    incomingTransactionId: "3fa85f64-5717-4562-b3fc-2c963f66be01",
    candidateRecurringTransactionIds: ["3fa85f64-5717-4562-b3fc-2c963f66be02"],
    status: "amount_mismatch",
    createdAt: timestamp,
    updatedAt: timestamp,
    incomingTransaction: {
      id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
      userId: "user-1",
      accountId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
      type: "expense",
      amountMinor: 200_000,
      currency: "INR",
      occurredAt: timestamp,
      description,
      tags: [],
      source: "api",
      status: "posted",
      paymentRail: "unknown",
      counterpartyHandle: null,
      createdAt: timestamp,
      updatedAt: timestamp
    },
    candidateTransactions: []
  };
}

describe("ReconciliationReviewPanel", () => {
  it("renders nothing when there is nothing pending", () => {
    const { container } = render(<ReconciliationReviewPanel initialReconciliations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a heading with the pending count and one card per item", () => {
    render(
      <ReconciliationReviewPanel
        initialReconciliations={[fixture("a", "Claude"), fixture("b", "Netflix")]}
      />
    );

    expect(screen.getByText("2 recurring charges to confirm")).toBeVisible();
    expect(screen.getByText("Claude")).toBeVisible();
    expect(screen.getByText("Netflix")).toBeVisible();
  });

  it("uses singular copy for exactly one pending item", () => {
    render(<ReconciliationReviewPanel initialReconciliations={[fixture("a", "Claude")]} />);
    expect(screen.getByText("1 recurring charge to confirm")).toBeVisible();
  });

  it("hides a card immediately once it reports itself resolved", async () => {
    const user = userEvent.setup();
    render(
      <ReconciliationReviewPanel
        initialReconciliations={[fixture("a", "Claude"), fixture("b", "Netflix")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Resolve a" }));

    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeVisible();
    expect(onResolvedCallback).toBeDefined();
  });
});
