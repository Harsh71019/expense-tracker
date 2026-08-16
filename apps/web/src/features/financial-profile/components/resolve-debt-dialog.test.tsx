import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeclaredDebt } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { ResolveDebtDialog } from "./resolve-debt-dialog";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  pending: { current: false },
  key: { current: "resolve-key-1" }
}));

vi.mock("../hooks/use-debt-profile", () => ({
  useUpdateDeclaredDebt: () => ({
    mutateAsync: mocks.update,
    isPending: mocks.pending.current,
    idempotencyKey: mocks.key.current
  })
}));

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

function reset(): void {
  mocks.update.mockReset().mockResolvedValue(debt({ status: "resolved" }));
  mocks.pending.current = false;
  mocks.key.current = "resolve-key-1";
}

describe("ResolveDebtDialog wording", () => {
  it("frames the action as removing the debt from planning, not paying it", () => {
    reset();
    render(<ResolveDebtDialog debt={debt()} onClose={vi.fn()} onResolved={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /Remove “Amex revolve” from active planning\?/ })
    ).toBeVisible();
    expect(screen.getByText(/stops the debt being counted in planning checks/)).toBeVisible();
    expect(
      screen.getByText(/does not pay anything, post a transaction, or change an account balance/)
    ).toBeVisible();
  });

  it("never uses paid, payoff, or close-loan language", () => {
    reset();
    const { container } = render(
      <ResolveDebtDialog debt={debt()} onClose={vi.fn()} onResolved={vi.fn()} />
    );

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/debt paid/i);
    expect(text).not.toMatch(/pay debt/i);
    expect(text).not.toMatch(/close loan/i);
    expect(text).not.toMatch(/paid off/i);
    expect(screen.getByRole("button", { name: "Resolve debt record" })).toBeVisible();
  });

  it("says net worth is unaffected for an unlinked debt", () => {
    reset();
    render(<ResolveDebtDialog debt={debt()} onClose={vi.fn()} onResolved={vi.fn()} />);

    expect(screen.getByText(/Your net worth is unaffected/)).toBeVisible();
  });

  it("says the linked asset stays open and untouched for a linked debt", () => {
    reset();
    render(
      <ResolveDebtDialog
        debt={debt({
          linkedAssetId: "22222222-2222-4222-8222-222222222222",
          linkedAssetName: "Car loan asset",
          amountSource: "linked_asset",
          declaredOutstandingMinor: null,
          isEstimate: false
        })}
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByText(/linked asset stays open with its valuations untouched/)).toBeVisible();
  });
});

describe("ResolveDebtDialog behaviour", () => {
  it("resolves through a metadata status change only", async () => {
    reset();
    const onClose = vi.fn();
    const onResolved = vi.fn();
    const user = userEvent.setup();
    render(<ResolveDebtDialog debt={debt()} onClose={onClose} onResolved={onResolved} />);

    await user.click(screen.getByRole("button", { name: "Resolve debt record" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1));
    expect(mocks.update).toHaveBeenCalledWith({
      debtId: "11111111-1111-4111-8111-111111111111",
      patch: { status: "resolved" }
    });
    expect(onResolved).toHaveBeenCalledWith("Amex revolve removed from active planning checks.");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lets the user back out without changing anything", async () => {
    reset();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ResolveDebtDialog debt={debt()} onClose={onClose} onResolved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Keep it active" }));

    expect(mocks.update).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a mutation error and keeps the dialog open", async () => {
    reset();
    mocks.update.mockRejectedValue(new AppError("boom"));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ResolveDebtDialog debt={debt()} onClose={onClose} onResolved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Resolve debt record" }));

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps one idempotency key across retries of the same resolution", async () => {
    reset();
    mocks.update.mockRejectedValue(new AppError("network"));
    const user = userEvent.setup();
    render(<ResolveDebtDialog debt={debt()} onClose={vi.fn()} onResolved={vi.fn()} />);

    const resolve = screen.getByRole("button", { name: "Resolve debt record" });
    await user.click(resolve);
    await screen.findByRole("alert");
    const keyAfterFirst = mocks.key.current;

    await user.click(resolve);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));

    expect(mocks.key.current).toBe(keyAfterFirst);
  });

  it("disables both actions while resolving", () => {
    reset();
    mocks.pending.current = true;
    render(<ResolveDebtDialog debt={debt()} onClose={vi.fn()} onResolved={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Resolving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Keep it active" })).toBeDisabled();
  });
});
