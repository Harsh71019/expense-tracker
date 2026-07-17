import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RootLayout from "./layout";

const mocks = vi.hoisted((): { theme: "dark" | null } => ({ theme: "dark" }));

vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "font-mono" }),
  Inter_Tight: () => ({ variable: "font-sans" })
}));

vi.mock("../lib/theme-server", () => ({ getStoredTheme: async () => mocks.theme }));

describe("RootLayout", () => {
  it("applies the stored theme and wraps children", async () => {
    render(
      await RootLayout({
        children: <p>Ledger content</p>
      })
    );

    expect(screen.getByText("Ledger content")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("does not set a theme attribute when no preference is stored", async () => {
    mocks.theme = null;
    render(await RootLayout({ children: <p>System theme</p> }));

    expect(document.documentElement).not.toHaveAttribute("data-theme");
  });
});
