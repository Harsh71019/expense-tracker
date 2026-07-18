import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TransferList } from "./transfer-list";

const mocks = vi.hoisted(() => {
  const noTags: string[] = [];
  const base = {
    userId: "user-1",
    accountId: "507f1f77bcf86cd799439001",
    amountMinor: 5_000_00,
    currency: "INR" as const,
    occurredAt: new Date("2026-07-10T08:00:00.000Z"),
    tags: noTags,
    source: "manual" as const,
    status: "posted" as const,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  const transferLegA1 = {
    ...base,
    id: "507f1f77bcf86cd799439011",
    transferGroupId: "grp-1",
    type: "expense" as const,
    description: "Monthly SIP top-up"
  };
  const transferLegA2 = {
    ...base,
    id: "507f1f77bcf86cd799439012",
    transferGroupId: "grp-1",
    type: "income" as const,
    description: "Monthly SIP top-up"
  };
  const plainTxn = {
    ...base,
    id: "507f1f77bcf86cd799439013",
    type: "expense" as const,
    description: "Not a transfer"
  };
  return {
    transferLegA1,
    transferLegA2,
    plainTxn,
    items: [transferLegA1, transferLegA2, plainTxn],
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    fetching: false,
    isError: false
  };
});

vi.mock("@/features/accounts", () => ({ useAccounts: () => ({ data: [] }) }));

vi.mock("@/features/transactions", () => ({
  useTxnList: () => ({
    data: {
      pages: [{ items: mocks.items, pageInfo: { nextCursor: null, hasMore: false, limit: 100 } }]
    },
    hasNextPage: mocks.hasNextPage,
    isFetchingNextPage: mocks.fetching,
    isError: mocks.isError,
    fetchNextPage: mocks.fetchNextPage
  })
}));

vi.mock("./transfer-detail-drawer", () => ({
  TransferDetailDrawer: ({
    legs,
    onClose
  }: {
    legs: { description: string }[];
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="detail-drawer">
      {legs[0]?.description}
      <button onClick={onClose}>close-drawer</button>
    </div>
  )
}));
vi.mock("./create-transfer-sheet", () => ({
  CreateTransferSheet: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="create-sheet">
      <button onClick={onClose}>close-sheet</button>
    </div>
  )
}));

const emptyPage = { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 100 } };

describe("TransferList", () => {
  beforeEach(() => {
    mocks.hasNextPage = false;
    mocks.fetching = false;
    mocks.fetchNextPage.mockReset();
  });

  it("auto-fetches further pages until exhausted, instead of requiring a manual click", () => {
    mocks.items = [mocks.transferLegA1, mocks.transferLegA2, mocks.plainTxn];
    mocks.hasNextPage = true;
    render(<TransferList initialPage={emptyPage} />);

    expect(mocks.fetchNextPage).toHaveBeenCalled();
    expect(screen.getByText("Loading more transfers…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("does not fetch again while a page is already in flight", () => {
    mocks.items = [mocks.transferLegA1, mocks.transferLegA2, mocks.plainTxn];
    mocks.hasNextPage = true;
    mocks.fetching = true;
    render(<TransferList initialPage={emptyPage} />);

    expect(mocks.fetchNextPage).not.toHaveBeenCalled();
  });

  it("pairs legs into a single group row and ignores non-transfer transactions", () => {
    mocks.items = [mocks.transferLegA1, mocks.transferLegA2, mocks.plainTxn];
    render(<TransferList initialPage={emptyPage} />);

    expect(screen.getAllByText("Monthly SIP top-up")).toHaveLength(1);
    expect(screen.queryByText("Not a transfer")).not.toBeInTheDocument();
  });

  it("opens the detail drawer with both legs on row click", async () => {
    mocks.items = [mocks.transferLegA1, mocks.transferLegA2, mocks.plainTxn];
    const user = userEvent.setup();
    render(<TransferList initialPage={emptyPage} />);

    await user.click(screen.getByText("Monthly SIP top-up"));
    expect(screen.getByRole("dialog", { name: "detail-drawer" })).toBeVisible();
  });

  it("opens the create sheet from the New transfer button", async () => {
    mocks.items = [mocks.transferLegA1, mocks.transferLegA2, mocks.plainTxn];
    const user = userEvent.setup();
    render(<TransferList initialPage={emptyPage} />);

    await user.click(screen.getByRole("button", { name: /New transfer/ }));
    expect(screen.getByRole("dialog", { name: "create-sheet" })).toBeVisible();
  });

  it("shows the empty state when there are no transfer groups", () => {
    mocks.items = [mocks.plainTxn];
    render(<TransferList initialPage={emptyPage} />);
    expect(screen.getByRole("heading", { name: "No transfers yet" })).toBeVisible();
  });
});
