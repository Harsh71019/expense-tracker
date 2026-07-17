import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "./sign-out-button";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh })
}));

vi.mock("../../../lib/auth/client", () => ({
  authClient: { signOut: mocks.signOut }
}));

describe("SignOutButton", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
  });

  it("ends the session then navigates to a refreshed login page", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("restores the control and explains a rejected sign-out request", async () => {
    mocks.signOut.mockRejectedValue(new TypeError("Network unavailable"));
    const user = userEvent.setup();
    render(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign out right now");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("uses an icon-sized sign-out control in compact mode", () => {
    render(<SignOutButton compact />);

    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("h-10", "w-10");
  });
});
