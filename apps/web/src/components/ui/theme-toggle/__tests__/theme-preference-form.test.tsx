import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemePreferenceForm } from "../theme-preference-form";

vi.mock("../../../../lib/theme-actions", () => ({ applyThemePreference: vi.fn() }));

describe("ThemePreferenceForm", () => {
  it("marks the system preference when no cookie is stored", () => {
    render(<ThemePreferenceForm current={null} />);

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks an explicit theme preference", () => {
    render(<ThemePreferenceForm current="dark" />);

    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });
});
