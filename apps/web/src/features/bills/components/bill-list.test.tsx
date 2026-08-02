import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSchema, BillPageSchema } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { BillList } from "./bill-list";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("../hooks/use-bills", () => ({
  useBills: (_filters: unknown, initialPage: unknown) => ({
    data: { pages: [initialPage] },
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false
  })
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push })
}));

const timestamp = new Date("2026-07-25T00:00:00.000Z");
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
const page = BillPageSchema.parse({
  items: [
    {
      id: "3fa85f64-5717-4562-b3fc-2c963f66be01",
      userId: "user-1",
      accountId: card.id,
      cycleStart: new Date("2026-06-26T00:00:00.000Z"),
      cycleEnd: timestamp,
      dueDate: new Date("2026-08-15T00:00:00.000Z"),
      amountDueMinor: 10_000,
      reconciliationStatus: "awaiting_statement",
      paidMinor: 2_500,
      remainingMinor: 7_500,
      paymentStatus: "partial",
      createdAt: timestamp,
      updatedAt: timestamp
    }
  ],
  pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
});

describe("BillList", () => {
  it("shows authoritative bill amounts and statement action", () => {
    render(<BillList initialPage={page} filters={{ limit: 50 }} accounts={[card]} />);
    expect(screen.getByRole("heading", { name: "Credit card bills" })).toBeVisible();
    expect(screen.getByText("HDFC Card")).toBeVisible();
    expect(screen.getByText("Statement required")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "25% of bill paid" })).toHaveAttribute(
      "aria-valuenow",
      "25"
    );
    expect(screen.getByRole("link", { name: /Open bill/ })).toHaveAttribute(
      "href",
      `/bills/${page.items[0]?.id}`
    );
  });

  it("distinguishes missing cards from a configured card awaiting its first bill", () => {
    const empty = BillPageSchema.parse({
      items: [],
      pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
    });
    const { rerender } = render(
      <BillList initialPage={empty} filters={{ limit: 50 }} accounts={[]} />
    );
    expect(screen.getByText("No credit cards configured")).toBeVisible();

    rerender(<BillList initialPage={empty} filters={{ limit: 50 }} accounts={[card]} />);
    expect(screen.getByText("No generated bills yet")).toBeVisible();
  });

  it("serializes filters into the route", async () => {
    const user = userEvent.setup();
    render(<BillList initialPage={page} filters={{ limit: 50 }} accounts={[card]} />);
    await user.click(screen.getByRole("combobox", { name: "Filter by payment status" }));
    await user.click(screen.getByRole("option", { name: "Part-paid" }));
    expect(mocks.push).toHaveBeenCalledWith("/bills?paymentStatus=partial");
  });
});
