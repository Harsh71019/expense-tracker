import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Account } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDetailDialog } from "./account-detail-dialog";

const mocks = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

const account: Account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "HDFC",
  type: "bank",
  currency: "INR",
  balanceMinor: 150_00,
  openingBalanceMinor: 100_00,
  isArchived: false,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-01T00:00:00.000Z")
};

describe("AccountDetailDialog", () => {
  beforeEach(() => {
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows the account id and copies it to the clipboard", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const onClose = vi.fn();

    render(<AccountDetailDialog account={account} onClose={onClose} />);

    expect(screen.getByText("HDFC")).toBeVisible();
    expect(screen.getByText(account.id)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(account.id);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Account ID copied");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("reports when the clipboard rejects the copy", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
    });

    render(<AccountDetailDialog account={account} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(mocks.toastError).toHaveBeenCalledWith("Could not copy this ID");
  });
});
