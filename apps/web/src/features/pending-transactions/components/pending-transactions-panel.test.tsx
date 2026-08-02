import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingTransaction } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { PendingTransactionsPanel } from "./pending-transactions-panel";

vi.mock("../hooks/use-pending-transactions", () => ({
  usePendingTransactions: (items: PendingTransaction[]) => ({
    data: items,
    error: null
  })
}));

let onResolvedCallback: ((id: string) => void) | undefined;
vi.mock("./pending-transaction-card", () => ({
  PendingTransactionCard: ({
    item,
    onResolved
  }: {
    item: PendingTransaction;
    onResolved: (id: string) => void;
  }) => {
    onResolvedCallback = onResolved;
    return (
      <article>
        {item.description}
        <button type="button" onClick={() => onResolved(item.id)}>
          Resolve {item.id}
        </button>
      </article>
    );
  }
}));

const timestamp = new Date("2026-08-01T00:00:00.000Z");

function fixture(id: string, description: string): PendingTransaction {
  return {
    id,
    userId: "user-1",
    accountId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
    type: "expense",
    occurredAt: timestamp,
    description,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("PendingTransactionsPanel", () => {
  it("renders nothing when there is nothing pending", () => {
    const { container } = render(<PendingTransactionsPanel initialPendingTransactions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a heading with the pending count and one card per item", () => {
    render(
      <PendingTransactionsPanel
        initialPendingTransactions={[fixture("a", "Anthropic"), fixture("b", "Netflix")]}
      />
    );

    expect(screen.getByText("2 transactions need an amount")).toBeVisible();
    expect(screen.getByText("Anthropic")).toBeVisible();
    expect(screen.getByText("Netflix")).toBeVisible();
  });

  it("uses singular copy for exactly one pending item", () => {
    render(<PendingTransactionsPanel initialPendingTransactions={[fixture("a", "Anthropic")]} />);
    expect(screen.getByText("1 transaction needs an amount")).toBeVisible();
  });

  it("hides a card immediately once it reports itself resolved", async () => {
    const user = userEvent.setup();
    render(
      <PendingTransactionsPanel
        initialPendingTransactions={[fixture("a", "Anthropic"), fixture("b", "Netflix")]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Resolve a" }));

    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeVisible();
    expect(onResolvedCallback).toBeDefined();
  });
});
