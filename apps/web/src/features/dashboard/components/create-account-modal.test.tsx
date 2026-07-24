import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateAccountModal } from "./create-account-modal";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), pending: false }));
vi.mock("@/features/accounts", () => ({
  useCreateAccount: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));

describe("CreateAccountModal", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
  });

  it("renders nothing when closed", () => {
    render(<CreateAccountModal open={false} initialType="bank" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with the requested starter type preselected", () => {
    render(<CreateAccountModal open initialType="investment" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Investment/ })).toHaveClass("border-accent");
  });

  it("validates the account name before creating an account", async () => {
    const user = userEvent.setup();
    render(<CreateAccountModal open initialType="bank" onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("creates an owed account and closes the modal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.mutateAsync.mockResolvedValue({});
    render(<CreateAccountModal open initialType="credit_card" onClose={onClose} />);

    await user.type(screen.getByLabelText("Account name"), "Axis Credit Card");
    await user.clear(screen.getByLabelText("Opening balance"));
    await user.type(screen.getByLabelText("Opening balance"), "1000");
    await user.click(screen.getByRole("button", { name: "− Owed" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: "Axis Credit Card",
      type: "credit_card",
      openingBalanceMinor: -100_000
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a useful error when account creation fails", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("Account name is already in use"));
    render(<CreateAccountModal open initialType="bank" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Account name"), "Cash");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Account name is already in use");
  });

  it("closes without submitting when cancelled or the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CreateAccountModal open initialType="bank" onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("disables submission while the account is being created", () => {
    mocks.pending = true;
    render(<CreateAccountModal open initialType="bank" onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
  });
});
