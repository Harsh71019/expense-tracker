import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { SignOutButton } from "./sign-out-button";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh })
}));

vi.mock("../../../lib/auth/client", () => ({
  authClient: { signOut: mocks.signOut }
}));
vi.mock("../../../lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

function renderButton(ui: ReactNode = <SignOutButton />): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(client, "clear");
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return client;
}

describe("SignOutButton", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("ends the session then navigates to a refreshed login page", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const client = renderButton();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(client.clear).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Signed out successfully");
  });

  it("restores the control and explains a rejected sign-out request", async () => {
    mocks.signOut.mockRejectedValue(new TypeError("Network unavailable"));
    const user = userEvent.setup();
    renderButton();

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign out right now");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Unable to sign out right now. Check your connection and try again."
    );
  });

  it("uses an icon-sized sign-out control in compact mode", () => {
    renderButton(<SignOutButton compact />);

    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("h-11", "w-11");
  });
});
