import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterForm } from "./register-form";

const mocks = vi.hoisted(() => ({
  searchParams: "next=%2Ftransactions",
  signUpWithEmail: vi.fn(),
  push: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.searchParams),
  useRouter: () => ({ push: mocks.push })
}));

vi.mock("../../../lib/auth/client", () => ({
  authClient: { signUp: { email: mocks.signUpWithEmail } }
}));
vi.mock("../../../lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    mocks.searchParams = "next=%2Ftransactions";
    mocks.signUpWithEmail.mockReset();
    mocks.push.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("submits trimmed details and routes the user to login with the safe return path", async () => {
    mocks.signUpWithEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user, { displayName: "  Harsh  " });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.signUpWithEmail).toHaveBeenCalledWith({
      name: "Harsh",
      email: "harsh@example.com",
      password: "correct-password",
      callbackURL: "/transactions"
    });
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/login?registered=1&next=%2Ftransactions")
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "If registration is available for this email, your account is ready. Sign in to continue."
    );
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Ftransactions"
    );
  });

  it("rejects mismatched passwords without calling Better Auth and focuses the error", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user, { confirmation: "different-password" });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.signUpWithEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Passwords do not match");
    expect(screen.getByRole("alert")).toHaveFocus();
  });

  it("rejects a password shorter than eight characters", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user, { password: "1234567", confirmation: "1234567" });
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.signUpWithEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("at least 8 characters");
  });

  it("rejects a password longer than 128 characters", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);
    await user.type(screen.getByLabelText("Display name"), "Harsh");
    await user.type(screen.getByLabelText("Email"), "harsh@example.com");
    const longPassword = "x".repeat(129);
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: longPassword }
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: longPassword }
    });

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.signUpWithEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("no more than 128 characters");
  });

  it("maps disabled signup to a deployment-specific message", async () => {
    mocks.signUpWithEmail.mockResolvedValue({
      error: { code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" }
    });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Registration is disabled for this TreasuryOps deployment"
    );
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Registration is disabled for this TreasuryOps deployment."
    );
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
  });

  it("maps provider rate limiting to a retry-later message", async () => {
    mocks.signUpWithEmail.mockResolvedValue({ error: { status: 429 } });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many registration attempts");
  });

  it("shows a retryable message when the registration request rejects", async () => {
    mocks.signUpWithEmail.mockRejectedValue(new TypeError("Network unavailable"));
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to register right now");
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Unable to register right now. Check your connection and try again."
    );
  });

  it("keeps password values intact when their visibility changes", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.type(screen.getByLabelText("Confirm password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Password")).toHaveValue("correct-password");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("correct-password");
  });

  it("sanitizes an external return path before submitting or linking", async () => {
    mocks.searchParams = "next=https%3A%2F%2Fattacker.invalid";
    mocks.signUpWithEmail.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<RegisterForm />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(mocks.signUpWithEmail).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: "/" })
    );
    expect(mocks.push).toHaveBeenCalledWith("/login?registered=1");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});

async function fillValidForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Readonly<{
    displayName?: string;
    email?: string;
    password?: string;
    confirmation?: string;
  }> = {}
): Promise<void> {
  await user.type(screen.getByLabelText("Display name"), overrides.displayName ?? "Harsh");
  await user.type(screen.getByLabelText("Email"), overrides.email ?? "harsh@example.com");
  await user.type(screen.getByLabelText("Password"), overrides.password ?? "correct-password");
  await user.type(
    screen.getByLabelText("Confirm password"),
    overrides.confirmation ?? "correct-password"
  );
}
