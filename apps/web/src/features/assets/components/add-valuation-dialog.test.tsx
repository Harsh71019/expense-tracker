import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AddValuationDialog } from "./add-valuation-dialog";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  pending: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-asset-mutations", () => ({
  useCreateValuation: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

const fd: Asset = {
  id: "507f1f77bcf86cd799439021",
  userId: "u1",
  kind: "fixed_deposit",
  name: "HDFC FD 2025",
  openedAt: new Date("2025-04-01T00:00:00.000Z"),
  isClosed: false,
  createdAt: new Date("2025-04-01T00:00:00.000Z"),
  updatedAt: new Date("2025-04-01T00:00:00.000Z")
};

const liability: Asset = { ...fd, kind: "loan_liability", name: "Car loan" };

async function enterAmount(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, "5000");
  await user.tab();
}

describe("AddValuationDialog", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("disables Add valuation until an amount is entered", async () => {
    const user = userEvent.setup();
    render(<AddValuationDialog asset={fd} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Add valuation" })).toBeDisabled();
    await enterAmount(user, "Value");
    expect(screen.getByRole("button", { name: "Add valuation" })).toBeEnabled();
  });

  it("submits a positive valuation for a non-liability asset", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    render(<AddValuationDialog asset={fd} onClose={onClose} />);

    await enterAmount(user, "Value");
    await user.click(screen.getByRole("button", { name: "Add valuation" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: fd.id,
        body: expect.objectContaining({ valueMinor: 500_000, source: "manual" })
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults a liability's valuation to negative and can toggle back to positive", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<AddValuationDialog asset={liability} onClose={vi.fn()} />);

    await enterAmount(user, "Value (you owe)");
    await user.click(screen.getByRole("button", { name: "Add valuation" }));
    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ valueMinor: -500_000 }) })
    );

    await user.click(screen.getByRole("button", { name: "Switch to positive" }));
    await user.click(screen.getByRole("button", { name: "Add valuation" }));
    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ valueMinor: 500_000 }) })
    );
  });

  it("shows a toast on failure and keeps the dialog open", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("boom"));
    const onClose = vi.fn();
    render(<AddValuationDialog asset={fd} onClose={onClose} />);

    await enterAmount(user, "Value");
    await user.click(screen.getByRole("button", { name: "Add valuation" }));

    expect(mocks.toastError).toHaveBeenCalledWith("Could not add this valuation");
    expect(onClose).not.toHaveBeenCalled();
  });
});
