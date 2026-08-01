import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account, Category } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { RecurringRuleDrawer } from "./recurring-rule-drawer";

vi.mock("../hooks/use-recurring-rules", () => ({
  useCreateRecurringRule: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateRecurringRule: () => ({ mutateAsync: vi.fn(), isPending: false })
}));

const timestamp = new Date("2026-08-01T00:00:00.000Z");
const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "HDFC Savings",
  type: "bank",
  currency: "INR",
  openingBalanceMinor: 0,
  balanceMinor: 100_000,
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};
const category: Category = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beff",
  userId: "user-1",
  name: "Housing",
  kind: "expense",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("RecurringRuleDrawer", () => {
  it("uses the shared drawer and phone-safe schedule controls", async () => {
    const user = userEvent.setup();
    render(<RecurringRuleDrawer accounts={[account]} categories={[category]} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "New recurring rule" })).toHaveClass(
      "max-h-[92dvh]",
      "sm:h-dvh"
    );
    expect(screen.getByRole("button", { name: "Close recurring rule" })).toHaveClass(
      "h-11",
      "w-11"
    );
    expect(screen.getByLabelText("Account")).toHaveClass("min-h-11", "text-base");
    expect(screen.getByRole("button", { name: "31" })).toHaveClass("min-h-11");

    await user.click(screen.getByRole("button", { name: "weekly" }));
    expect(screen.getByRole("button", { name: "MO" })).toHaveClass("min-h-11");
  });
});
