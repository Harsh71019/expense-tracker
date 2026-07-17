import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "../theme-toggle";

vi.mock("../../../lib/theme-actions", () => ({ toggleTheme: vi.fn() }));

describe("ThemeToggle", () => {
  it("offers light mode when the stored preference is dark or absent", () => {
    render(<ThemeToggle current={null} />);

    expect(screen.getByRole("button", { name: "Switch to light" })).toBeVisible();
  });

  it("offers dark mode when the stored preference is light", () => {
    render(<ThemeToggle current="light" />);

    expect(screen.getByRole("button", { name: "Switch to dark" })).toBeVisible();
  });

  it("uses an icon-sized accessible control in compact mode", () => {
    render(<ThemeToggle current="light" compact />);

    expect(screen.getByRole("button", { name: "Switch to dark" })).toHaveClass("h-10", "w-10");
  });
});
