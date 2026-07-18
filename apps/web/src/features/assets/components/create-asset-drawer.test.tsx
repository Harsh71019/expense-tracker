import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateAssetDrawer } from "./create-asset-drawer";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  pending: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("../hooks/use-asset-mutations", () => ({
  useCreateAsset: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

async function enterOpeningValue(
  user: ReturnType<typeof userEvent.setup>,
  amount: string
): Promise<void> {
  const input = screen.getByLabelText(/Opening value/);
  await user.clear(input);
  await user.type(input, amount);
  await user.tab();
}

describe("CreateAssetDrawer", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("disables Create asset until a name and a positive value are entered", async () => {
    const user = userEvent.setup();
    render(<CreateAssetDrawer onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Create asset" })).toBeDisabled();
    await user.type(screen.getByLabelText("Name"), "HDFC FD 2026");
    expect(screen.getByRole("button", { name: "Create asset" })).toBeDisabled();

    await enterOpeningValue(user, "50000");
    expect(screen.getByRole("button", { name: "Create asset" })).toBeEnabled();
  });

  it("shows fixed-deposit fields by default and swaps to a quantity field for gold", async () => {
    const user = userEvent.setup();
    render(<CreateAssetDrawer onClose={vi.fn()} />);

    expect(screen.getByLabelText("Maturity")).toBeVisible();
    expect(screen.getByLabelText("Annual rate % p.a.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /Gold$/ }));
    expect(screen.queryByLabelText("Maturity")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quantity in grams")).toBeVisible();
  });

  it("creates a fixed deposit with maturity, rate, and a positive opening value", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    const onClose = vi.fn();
    render(<CreateAssetDrawer onClose={onClose} />);

    await user.type(screen.getByLabelText("Name"), "HDFC FD 2026");
    await user.type(screen.getByLabelText("Maturity"), "2028-01-01");
    await user.type(screen.getByLabelText("Annual rate % p.a."), "7.5");
    await enterOpeningValue(user, "50000");
    await user.click(screen.getByRole("button", { name: "Create asset" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "fixed_deposit",
        name: "HDFC FD 2026",
        openingValueMinor: 5_000_000,
        annualRateBps: 750
      })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults a loan-liability opening value to negative and lets it toggle positive", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<CreateAssetDrawer onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Loan \(you owe\)/ }));
    expect(screen.getByText(/A liability you owe opens negative/)).toBeVisible();

    await user.type(screen.getByLabelText("Name"), "Car loan");
    await enterOpeningValue(user, "80000");
    await user.click(screen.getByRole("button", { name: "Create asset" }));

    expect(mocks.mutateAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "loan_liability", openingValueMinor: -8_000_000 })
    );
  });

  it("converts a gram quantity into milli-units for gold", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<CreateAssetDrawer onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /Gold$/ }));
    await user.type(screen.getByLabelText("Name"), "Gold coins");
    await user.type(screen.getByLabelText("Quantity in grams"), "24");
    await enterOpeningValue(user, "144000");
    await user.click(screen.getByRole("button", { name: "Create asset" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "gold", quantityMilliUnits: 24_000 })
    );
  });

  it("shows a toast on failure and keeps the drawer open", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("boom"));
    const onClose = vi.fn();
    render(<CreateAssetDrawer onClose={onClose} />);

    await user.type(screen.getByLabelText("Name"), "HDFC FD 2026");
    await enterOpeningValue(user, "50000");
    await user.click(screen.getByRole("button", { name: "Create asset" }));

    expect(mocks.toastError).toHaveBeenCalledWith("Could not create this asset");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes without creating on Cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateAssetDrawer onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});
