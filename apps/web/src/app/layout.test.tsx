import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import RootLayout from "./layout";

const mocks = vi.hoisted(
  (): {
    theme: "dark" | null;
    accent:
      | { kind: "default" }
      | { kind: "preset"; preset: "ocean" }
      | { kind: "custom"; color: "#1d4ed8" };
  } => ({ theme: "dark", accent: { kind: "preset", preset: "ocean" } })
);

vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "font-mono" }),
  Inter_Tight: () => ({ variable: "font-sans" })
}));

vi.mock("../lib/theme-server", () => ({ getStoredTheme: async () => mocks.theme }));
vi.mock("../lib/accent-server", () => ({ getStoredAccent: async () => mocks.accent }));
vi.mock("../components/ui/sonner", () => ({
  Toaster: ({ theme }: Readonly<{ theme?: string }>): ReactNode => (
    <div aria-label="Application notifications" data-toaster-theme={theme} />
  )
}));

describe("RootLayout", () => {
  it("applies the stored theme and wraps children", async () => {
    render(
      await RootLayout({
        children: <p>Ledger content</p>
      })
    );

    expect(screen.getByText("Ledger content")).toBeVisible();
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveAttribute("data-accent", "ocean");
    expect(screen.getByLabelText("Application notifications")).toHaveAttribute(
      "data-toaster-theme",
      "dark"
    );
  });

  it("does not set theme or accent attributes when no preference is stored", async () => {
    mocks.theme = null;
    mocks.accent = { kind: "default" };
    render(await RootLayout({ children: <p>System theme</p> }));

    expect(document.documentElement).not.toHaveAttribute("data-theme");
    expect(document.documentElement).not.toHaveAttribute("data-accent");
    expect(screen.getByLabelText("Application notifications")).toHaveAttribute(
      "data-toaster-theme",
      "system"
    );
  });

  it("applies validated custom properties before rendering", async () => {
    mocks.accent = { kind: "custom", color: "#1d4ed8" };
    render(await RootLayout({ children: <p>Custom accent</p> }));

    expect(document.documentElement).toHaveAttribute("data-accent", "custom");
    expect(document.documentElement.style.getPropertyValue("--accent-choice-light")).toBe(
      "#1d4ed8"
    );
  });
});
