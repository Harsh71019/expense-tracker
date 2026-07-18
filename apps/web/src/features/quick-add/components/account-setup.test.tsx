import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSetup } from "./account-setup";

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), pending: false }));
vi.mock("../hooks/use-create-account", () => ({
  useCreateAccount: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));

describe("AccountSetup", () => {
  beforeEach(() => {
    mocks.mutateAsync.mockReset();
    mocks.pending = false;
  });

  it("validates the account name before creating an account", async () => {
    const user = userEvent.setup();
    render(<AccountSetup />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("creates a zero-opening balance account", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({});
    render(<AccountSetup />);

    await user.type(screen.getByLabelText("Account name"), "HDFC");
    await user.selectOptions(screen.getByLabelText("Account type"), "bank");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      name: "HDFC",
      type: "bank",
      openingBalanceMinor: 0
    });
  });

  it("keeps a useful error when account creation fails", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("Account name is already in use"));
    render(<AccountSetup />);

    await user.type(screen.getByLabelText("Account name"), "Cash");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Account name is already in use");
  });

  it("uses a safe fallback for non-Error failures", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue("offline");
    render(<AccountSetup />);

    await user.type(screen.getByLabelText("Account name"), "Cash");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the account.");
  });

  it("disables submission while the account is being created", () => {
    mocks.pending = true;
    render(<AccountSetup />);

    expect(screen.getByRole("button", { name: "Creating account…" })).toBeDisabled();
  });
});
