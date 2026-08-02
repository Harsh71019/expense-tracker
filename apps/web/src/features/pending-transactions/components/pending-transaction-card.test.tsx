import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PendingTransaction } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PendingTransactionCard } from "./pending-transaction-card";

const mocks = vi.hoisted(
  (): {
    confirmMutate: ReturnType<typeof vi.fn>;
    confirmIsPending: boolean;
    confirmIsError: boolean;
    confirmError: Error | null;
    dismissMutate: ReturnType<typeof vi.fn>;
    dismissIsPending: boolean;
    dismissIsError: boolean;
    dismissError: Error | null;
  } => ({
    confirmMutate: vi.fn(),
    confirmIsPending: false,
    confirmIsError: false,
    confirmError: null,
    dismissMutate: vi.fn(),
    dismissIsPending: false,
    dismissIsError: false,
    dismissError: null
  })
);

vi.mock("../hooks/use-pending-transactions", () => ({
  useConfirmPendingTransaction: () => ({
    mutate: mocks.confirmMutate,
    isPending: mocks.confirmIsPending,
    isError: mocks.confirmIsError,
    error: mocks.confirmError
  }),
  useDismissPendingTransaction: () => ({
    mutate: mocks.dismissMutate,
    isPending: mocks.dismissIsPending,
    isError: mocks.dismissIsError,
    error: mocks.dismissError
  })
}));

const timestamp = new Date("2026-07-18T00:00:00.000Z");

const item: PendingTransaction = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66be10",
  userId: "user-1",
  accountId: "3fa85f64-5717-4562-b3fc-2c963f66be00",
  type: "expense",
  occurredAt: timestamp,
  description: "Anthropic — USD 23.60, INR amount pending",
  status: "pending",
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("PendingTransactionCard", () => {
  beforeEach(() => {
    mocks.confirmMutate.mockReset();
    mocks.confirmIsPending = false;
    mocks.confirmIsError = false;
    mocks.confirmError = null;
    mocks.dismissMutate.mockReset();
    mocks.dismissIsPending = false;
    mocks.dismissIsError = false;
    mocks.dismissError = null;
  });

  it("shows the description and disables confirm until an amount is entered", () => {
    render(<PendingTransactionCard item={item} onResolved={vi.fn()} />);

    expect(screen.getByText(item.description)).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
  });

  it("confirms with the typed amount", async () => {
    const user = userEvent.setup();
    render(<PendingTransactionCard item={item} onResolved={vi.fn()} />);

    const input = screen.getByLabelText("Amount");
    await user.clear(input);
    await user.type(input, "1999");
    await user.tab();

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(mocks.confirmMutate).toHaveBeenCalledWith(
      { id: item.id, amountMinor: 199_900 },
      expect.objectContaining({})
    );
  });

  it("dismisses without requiring an amount", async () => {
    const user = userEvent.setup();
    render(<PendingTransactionCard item={item} onResolved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(mocks.dismissMutate).toHaveBeenCalledWith(item.id, expect.objectContaining({}));
  });

  it("shows an inline error on confirm failure", () => {
    mocks.confirmIsError = true;
    mocks.confirmError = new Error("Server is unavailable");
    render(<PendingTransactionCard item={item} onResolved={vi.fn()} />);

    expect(screen.getByText("Server is unavailable")).toBeVisible();
  });

  it("calls onResolved when confirm succeeds", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    mocks.confirmMutate.mockImplementation(
      (_vars: unknown, options?: { onSuccess?: () => void }): void => {
        options?.onSuccess?.();
      }
    );
    render(<PendingTransactionCard item={item} onResolved={onResolved} />);

    const input = screen.getByLabelText("Amount");
    await user.clear(input);
    await user.type(input, "10");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(onResolved).toHaveBeenCalledWith(item.id);
  });

  it("calls onResolved when dismiss succeeds", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    mocks.dismissMutate.mockImplementation(
      (_vars: unknown, options?: { onSuccess?: () => void }): void => {
        options?.onSuccess?.();
      }
    );
    render(<PendingTransactionCard item={item} onResolved={onResolved} />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onResolved).toHaveBeenCalledWith(item.id);
  });
});
