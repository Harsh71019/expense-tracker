import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TxnList } from "./txn-list";

const mocks = vi.hoisted(() => ({
  empty: false,
  fetchNextPage: vi.fn(),
  hasNextPage: true,
  fetching: false,
  isError: false,
  mutate: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock("@/features/accounts", () => ({
  useAccounts: () => ({ data: [] })
}));
vi.mock("@/features/categories", () => ({
  useCategories: () => ({ data: [] })
}));
vi.mock("@/features/transfers", () => ({
  useReverseTransfer: () => ({ mutate: vi.fn(), isPending: false })
}));

const transaction = {
  id: "507f1f77bcf86cd799439011",
  userId: "user-1",
  accountId: "507f1f77bcf86cd799439012",
  type: "income" as const,
  amountMinor: 4_000,
  occurredAt: new Date(),
  description: "Refund",
  tags: [],
  currency: "INR" as const,
  source: "manual" as const,
  status: "posted" as const,
  createdAt: new Date(),
  updatedAt: new Date()
};

vi.mock("../hooks/use-txn-list", () => ({
  useTxnList: () => ({
    data: {
      pages: [
        {
          items: mocks.empty ? [] : [transaction],
          pageInfo: { nextCursor: "next", hasMore: true, limit: 50 }
        }
      ]
    },
    hasNextPage: mocks.hasNextPage,
    isFetchingNextPage: mocks.fetching,
    isError: mocks.isError,
    fetchNextPage: mocks.fetchNextPage
  })
}));
vi.mock("../hooks/use-reverse-txn", () => ({
  useReverseTxn: () => ({ mutate: mocks.mutate, isPending: false })
}));

describe("TxnList", () => {
  const page = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
  it("shows transaction actions, pagination, and refresh errors", async () => {
    const user = userEvent.setup();
    mocks.empty = false;
    mocks.hasNextPage = true;
    mocks.isError = true;
    render(<TxnList filters={{ limit: 50 }} initialPage={page} />);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(mocks.mutate).toHaveBeenCalledWith(transaction.id);
    expect(mocks.fetchNextPage).toHaveBeenCalled();
    expect(screen.getByText(/Could not refresh/)).toBeVisible();
  });
  it("uses the empty state when no rows are returned", () => {
    mocks.empty = true;
    mocks.hasNextPage = false;
    mocks.isError = false;
    render(<TxnList filters={{ limit: 50 }} initialPage={page} />);
    expect(screen.getByRole("heading", { name: "Your ledger is clear" })).toBeVisible();
  });
  it("disables pagination while the next page is loading", () => {
    mocks.empty = false;
    mocks.hasNextPage = true;
    mocks.isError = false;
    mocks.fetching = true;
    render(<TxnList filters={{ limit: 50 }} initialPage={page} />);
    expect(screen.getByRole("button", { name: "Loading entries…" })).toBeDisabled();
  });
});
