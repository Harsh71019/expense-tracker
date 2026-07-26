import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./login-form";

const mocks = vi.hoisted(() => ({
  searchParams: "next=%2Ftransactions",
  signInWithEmail: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh })
}));

vi.mock("../../../lib/auth/client", () => ({
  authClient: { signIn: { email: mocks.signInWithEmail } }
}));
vi.mock("../../../lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

describe("LoginForm", () => {
  beforeEach(() => {
    mocks.searchParams = "next=%2Ftransactions";
    mocks.signInWithEmail.mockReset();
    mocks.push.mockReset();
    mocks.refresh.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("submits entered credentials to the requested internal return path and navigates there", async () => {
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
      rememberMe: true,
      callbackURL: "/transactions"
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/transactions"));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Signed in successfully");
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
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Invalid credentials");
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
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Unable to sign in right now. Check your connection and try again."
    );
  });

  it("shows the neutral registration notice and preserves a safe return path", () => {
    mocks.searchParams = "registered=1&next=%2Ftransactions%3Faccount%3Dcash";

    render(<LoginForm />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "If registration is available for this email"
    );
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute(
      "href",
      "/register?next=%2Ftransactions%3Faccount%3Dcash"
    );
  });

  it("does not carry an external return URL into the register link", () => {
    mocks.searchParams = "next=https%3A%2F%2Fattacker.invalid";

    render(<LoginForm />);

    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
  });
});
