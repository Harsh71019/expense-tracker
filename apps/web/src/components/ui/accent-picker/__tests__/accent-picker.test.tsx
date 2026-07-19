import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccentPicker } from "../accent-picker";

vi.mock("../../../../lib/accent-actions", () => ({
  resetAccentPreference: vi.fn(),
  applyAccentPreference: vi.fn(async (_previous: unknown, formData: FormData) => {
    const selection = formData.get("accentSelection");
    const appliedKey =
      selection === "default"
        ? "default"
        : selection === "custom"
          ? `custom:${formData.get("accentColor")}`
          : `preset:${String(selection)}`;
    return { status: "success", message: "Applied.", appliedKey };
  })
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
    expect(screen.getByRole("button", { name: "Applied" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset to Vyaya default" })).toBeDisabled();
  });

  it("previews normalized custom input and reports invalid values", async () => {
    const user = userEvent.setup();
    render(<AccentPicker current={{ kind: "preset", preset: "ocean" }} />);
    const input = screen.getByLabelText("Hex, RGB, or HSL");

    await user.clear(input);
    await user.type(input, "rgb(255, 0, 0)");
    const apply = screen.getByRole("button", { name: "Apply color" });

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
    expect(screen.getByRole("button", { name: "Applied" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset to Vyaya default" })).toBeEnabled();
  });

  it("applies preset selections and becomes dirty when another color is chosen", async () => {
    const user = userEvent.setup();
    render(<AccentPicker current={{ kind: "default" }} />);

    await user.click(screen.getByRole("button", { name: /Ocean blue/ }));
    expect(screen.getByLabelText("Hex, RGB, or HSL")).toHaveValue("#1d4ed8");
    expect(screen.getByRole("button", { name: "Apply color" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Apply color" }));
    expect(await screen.findByRole("button", { name: "Applied" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Mumbai violet/ }));
    expect(screen.getByRole("button", { name: "Apply color" })).toBeEnabled();
  });

  it("restores default green without resubmitting the previous custom color", async () => {
    const user = userEvent.setup();
    render(<AccentPicker current={{ kind: "custom", color: "#ff0000" }} />);

    await user.click(screen.getByRole("button", { name: /Vyaya green/ }));
    expect(screen.getByLabelText("Hex, RGB, or HSL")).toHaveValue("#0f9d63");
    expect(screen.getByRole("button", { name: "Apply color" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Apply color" }));
    expect(await screen.findByRole("button", { name: "Applied" })).toBeDisabled();
  });
});
