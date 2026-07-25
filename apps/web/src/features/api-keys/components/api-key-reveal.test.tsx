import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiKeyReveal } from "./api-key-reveal";

const mocks = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("@/lib/toast", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError }
}));

describe("ApiKeyReveal", () => {
  beforeEach(() => {
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows the raw key, copies it, and dismisses", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText }
    });

    render(<ApiKeyReveal apiKey="ak_verysecret123" onDismiss={onDismiss} />);

    expect(screen.getByText("ak_verysecret123")).toBeVisible();
    expect(screen.getByText(/won't be shown again/i)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith("ak_verysecret123");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Copied to clipboard");

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("reports when the clipboard rejects the copy", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }
    });

    render(<ApiKeyReveal apiKey="ak_verysecret123" onDismiss={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(mocks.toastError).toHaveBeenCalledWith("Could not copy this key");
  });
});
