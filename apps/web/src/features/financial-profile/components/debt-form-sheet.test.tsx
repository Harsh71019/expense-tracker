import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, DeclaredDebt } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { DebtFormSheet } from "./debt-form-sheet";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  pending: { current: false },
  key: { current: "debt-key-1" }
}));

vi.mock("../hooks/use-debt-profile", () => ({
  useCreateDeclaredDebt: () => ({
    mutateAsync: mocks.create,
    isPending: mocks.pending.current,
    idempotencyKey: mocks.key.current
  })
}));

const LOAN_ID = "33333333-3333-4333-8333-333333333333";

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: LOAN_ID,
    userId: "user-a",
    kind: "loan_liability",
    name: "Car loan",
    openedAt: new Date("2026-01-01T00:00:00.000Z"),
    isClosed: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

const CREATED: DeclaredDebt = {
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
  resolvedAt: null
};

function reset(): void {
  mocks.create.mockReset().mockResolvedValue(CREATED);
  mocks.pending.current = false;
  mocks.key.current = "debt-key-1";
}

async function fill(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("Name"), "Amex revolve");
  await user.type(screen.getByLabelText(/Annual interest rate/), "42");
  const amount = screen.getByLabelText("Outstanding amount");
  await user.clear(amount);
  await user.type(amount, "85000");
  await user.tab();
}

describe("DebtFormSheet", () => {
  it("states that this records planning metadata only", () => {
    reset();
    render(<DebtFormSheet assets={[asset()]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(
      screen.getByText(/records a debt for planning only\. It posts no transaction/)
    ).toBeVisible();
  });

  it("converts a typed percentage into basis points before submitting", async () => {
    reset();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Save debt" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amex revolve",
        annualRateBps: 4_200,
        declaredOutstandingMinor: 85_000_00,
        linkedAssetId: null
      })
    );
  });

  it("offers only open loan liabilities in the link selector", async () => {
    reset();
    const user = userEvent.setup();
    render(
      <DebtFormSheet
        assets={[
          asset(),
          asset({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Closed loan",
            isClosed: true
          }),
          asset({
            id: "55555555-5555-4555-8555-555555555555",
            name: "Index fund",
            kind: "investment"
          })
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await user.click(screen.getByRole("combobox", { name: "Linked loan liability" }));

    expect(screen.getByRole("option", { name: "Car loan" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Closed loan" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Index fund" })).toBeNull();
  });

  it("hides the link selector entirely when there is nothing linkable", () => {
    reset();
    render(
      <DebtFormSheet assets={[asset({ kind: "investment" })]} onClose={vi.fn()} onSaved={vi.fn()} />
    );

    expect(screen.queryByRole("combobox", { name: "Linked loan liability" })).toBeNull();
    expect(screen.getByLabelText("Outstanding amount")).toBeVisible();
  });

  it("replaces the amount field with an explanation once a debt is linked", async () => {
    reset();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[asset()]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("combobox", { name: "Linked loan liability" }));
    await user.click(screen.getByRole("option", { name: "Car loan" }));

    expect(screen.queryByLabelText("Outstanding amount")).toBeNull();
    expect(
      screen.getByText(/outstanding amount will come from the linked asset.s latest valuation/)
    ).toBeVisible();
  });

  it("submits a linked debt with no outstanding amount of its own", async () => {
    reset();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[asset()]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "Car loan");
    await user.type(screen.getByLabelText(/Annual interest rate/), "9");
    await user.click(screen.getByRole("combobox", { name: "Linked loan liability" }));
    await user.click(screen.getByRole("option", { name: "Car loan" }));
    await user.click(screen.getByRole("button", { name: "Save debt" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ linkedAssetId: LOAN_ID, declaredOutstandingMinor: null })
    );
  });

  it("moves focus to the offending field when validation fails", async () => {
    reset();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save debt" }));

    expect(mocks.create).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
  });

  it("reports an invalid rate on the rate field", async () => {
    reset();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "Card");
    await user.type(screen.getByLabelText(/Annual interest rate/), "abc");
    const amount = screen.getByLabelText("Outstanding amount");
    await user.clear(amount);
    await user.type(amount, "1000");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Save debt" }));

    expect(
      await screen.findByText(/Rate must be a percentage with at most two decimals/)
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps one idempotency key across retries of the same submission", async () => {
    reset();
    mocks.create.mockRejectedValue(new AppError("network"));
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    await fill(user);
    const save = screen.getByRole("button", { name: "Save debt" });
    await user.click(save);
    await screen.findByRole("alert");
    const keyAfterFirst = mocks.key.current;

    await user.click(save);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));

    expect(mocks.key.current).toBe(keyAfterFirst);
  });

  it("closes and announces after a successful save", async () => {
    reset();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<DebtFormSheet assets={[]} onClose={onClose} onSaved={onSaved} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Save debt" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith("Debt added to your planning list.");
  });

  it("has an accessible close control and a described dialog", () => {
    reset();
    render(<DebtFormSheet assets={[]} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Close debt form" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Add a debt" })).toBeVisible();
  });
});
