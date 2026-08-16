import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeclaredDebt, DeclaredDebtPage } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { DebtInventory } from "./debt-inventory";

function debt(overrides: Partial<DeclaredDebt> = {}): DeclaredDebt {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "user-a",
    name: "Amex revolve",
    kind: "credit_card",
    declaredOutstandingMinor: 85_000_00,
    outstandingMinor: 85_000_00,
    annualRateBps: 4_200,
    minimumPaymentMinor: null,
    linkedAssetId: null,
    linkedAssetName: null,
    amountSource: "declared",
    valuationAsOf: null,
    isEstimate: true,
    isHighCost: true,
    status: "active",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    resolvedAt: null,
    ...overrides
  };
}

function page(items: DeclaredDebt[], highCostCount = 1): DeclaredDebtPage {
  return {
    items,
    pageInfo: { nextCursor: null, hasMore: false, limit: 50 },
    highCost: { thresholdBps: 1_200, comparison: "greater_than", highCostCount }
  };
}

const LINKED = debt({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Car loan",
  kind: "consumer_loan",
  declaredOutstandingMinor: null,
  outstandingMinor: 3_20_000_00,
  annualRateBps: 900,
  linkedAssetId: "33333333-3333-4333-8333-333333333333",
  linkedAssetName: "Car loan asset",
  amountSource: "linked_asset",
  valuationAsOf: new Date("2026-08-10T00:00:00.000Z"),
  isEstimate: false,
  isHighCost: false
});

describe("DebtInventory empty and loading states", () => {
  it("shows a skeleton while the first page loads", () => {
    const { container } = render(
      <DebtInventory page={null} isLoading onAddDebt={vi.fn()} onResolveDebt={vi.fn()} />
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });

  it("explains the empty state and states the high-cost threshold from the API", () => {
    render(
      <DebtInventory
        page={page([], 0)}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText("No debts declared")).toBeVisible();
    expect(screen.getByText(/above 12% a year is flagged as high cost/)).toBeVisible();
  });

  it("reports a load failure without inventing an empty list", () => {
    render(
      <DebtInventory page={null} isLoading={false} onAddDebt={vi.fn()} onResolveDebt={vi.fn()} />
    );

    expect(screen.getByRole("status")).toHaveTextContent(/could not load your declared debts/);
    expect(screen.queryByText("No debts declared")).toBeNull();
  });
});

describe("DebtInventory rows", () => {
  it("labels a declared amount as an estimate", () => {
    render(
      <DebtInventory
        page={page([debt()])}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText("Estimate")).toBeVisible();
    expect(screen.getByText(/Amount is your own estimate/)).toBeVisible();
    expect(screen.queryByText("From linked asset")).toBeNull();
  });

  it("labels a linked amount with its source and valuation date", () => {
    render(
      <DebtInventory
        page={page([LINKED], 0)}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText("From linked asset")).toBeVisible();
    expect(screen.getByText(/Amount comes from the latest valuation of/)).toBeVisible();
    expect(screen.getByText(/valued on 10 Aug 2026/)).toBeVisible();
    expect(screen.getByText(/never given a second balance of their own/)).toBeVisible();
  });

  it("says a linked asset has no valuation instead of showing nothing owed", () => {
    render(
      <DebtInventory
        page={page([{ ...LINKED, outstandingMinor: null, valuationAsOf: null }], 0)}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText("Not known")).toBeVisible();
    expect(screen.getByText(/no valuation recorded yet/)).toBeVisible();
    expect(screen.queryByText("₹0.00")).toBeNull();
  });

  it("says so when a linked asset is no longer available", () => {
    render(
      <DebtInventory
        page={page(
          [{ ...LINKED, linkedAssetName: null, outstandingMinor: null, valuationAsOf: null }],
          0
        )}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText(/linked to an asset that is no longer available/)).toBeVisible();
  });

  it("flags a high-cost rate and not a rate at the threshold", () => {
    render(
      <DebtInventory
        page={page([
          debt({ annualRateBps: 1_201, isHighCost: true }),
          debt({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Twelve percent",
            annualRateBps: 1_200,
            isHighCost: false
          })
        ])}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getAllByText("High cost")).toHaveLength(1);
    expect(screen.getByText("12.01% a year")).toBeVisible();
    expect(screen.getByText("12% a year")).toBeVisible();
  });

  it("summarises how many debts are above the threshold", () => {
    render(
      <DebtInventory
        page={page([debt()], 1)}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText("1 of these carry a rate above 12% a year.")).toBeVisible();
  });

  it("shows an optional minimum payment only when there is one", () => {
    render(
      <DebtInventory
        page={page([debt({ minimumPaymentMinor: 5_000_00 })])}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByText(/minimum payment/)).toBeVisible();
  });
});

describe("DebtInventory actions and wording", () => {
  it("offers Resolve and never implies a payment", () => {
    render(
      <DebtInventory
        page={page([debt()])}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Resolve" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Pay debt/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Debt paid/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Close loan/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete/i })).toBeNull();
  });

  it("passes the chosen debt to the resolve handler", async () => {
    const onResolveDebt = vi.fn();
    const user = userEvent.setup();
    render(
      <DebtInventory
        page={page([debt()])}
        isLoading={false}
        onAddDebt={vi.fn()}
        onResolveDebt={onResolveDebt}
      />
    );

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(onResolveDebt).toHaveBeenCalledWith(expect.objectContaining({ name: "Amex revolve" }));
  });

  it("offers adding a debt from the empty state", async () => {
    const onAddDebt = vi.fn();
    const user = userEvent.setup();
    render(
      <DebtInventory
        page={page([], 0)}
        isLoading={false}
        onAddDebt={onAddDebt}
        onResolveDebt={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Add a debt" }));

    expect(onAddDebt).toHaveBeenCalledTimes(1);
  });
});
