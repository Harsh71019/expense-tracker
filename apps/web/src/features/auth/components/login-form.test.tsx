import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({ signInWithEmail: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("next=%2Ftransactions")
}));

vi.mock("../../../lib/auth/client", () => ({
  authClient: { signIn: { email: mocks.signInWithEmail } }
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mocks.signInWithEmail.mockReset();
  });

  it("submits entered credentials to the requested internal return path", async () => {
    mocks.signInWithEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "harsh@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(mocks.signInWithEmail).toHaveBeenCalledWith({
      email: "harsh@example.com",
      password: "correct-password",
      callbackURL: "/transactions"
    });
  });

  it("renders the auth provider error and restores the submit button", async () => {
    mocks.signInWithEmail.mockResolvedValue({ error: { message: "Invalid credentials" } });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "harsh@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows a retryable error when the sign-in request rejects", async () => {
    mocks.signInWithEmail.mockRejectedValue(new TypeError("Network unavailable"));
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "harsh@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to sign in right now");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
