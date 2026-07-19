import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccentPicker } from "../accent-picker";

vi.mock("../../../../lib/accent-actions", () => ({
  resetAccentPreference: vi.fn(),
  selectAccentPreset: vi.fn(),
  saveCustomAccent: vi.fn(async () => ({ status: "idle", message: "" }))
}));

describe("AccentPicker", () => {
  it("shows presets, custom formats, and a disabled reset for the default", () => {
    render(<AccentPicker current={{ kind: "default" }} />);

    expect(screen.getByRole("heading", { name: "Accent color" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Vyaya green/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /Ocean blue/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByLabelText("Hex, RGB, or HSL")).toHaveValue("#0f9d63");
    expect(screen.getByRole("button", { name: "Reset to Vyaya default" })).toBeDisabled();
  });

  it("previews normalized custom input and reports invalid values", async () => {
    const user = userEvent.setup();
    render(<AccentPicker current={{ kind: "preset", preset: "ocean" }} />);
    const input = screen.getByLabelText("Hex, RGB, or HSL");
    const apply = screen.getByRole("button", { name: "Apply custom color" });

    await user.clear(input);
    await user.type(input, "rgb(255, 0, 0)");

    expect(screen.getByText("Light · #ff0000")).toBeVisible();
    expect(screen.getByText(/may resemble expense and error colors/i)).toBeVisible();
    expect(apply).toBeEnabled();

    await user.clear(input);
    await user.type(input, "var(--expense)");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Use #rrggbb/)).toBeVisible();
    expect(apply).toBeDisabled();
  });

  it("loads a saved custom value and allows reset", () => {
    render(<AccentPicker current={{ kind: "custom", color: "#1d4ed8" }} />);

    expect(screen.getByLabelText("Hex, RGB, or HSL")).toHaveValue("#1d4ed8");
    expect(screen.getByRole("button", { name: "Reset to Vyaya default" })).toBeEnabled();
  });
});
