import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNav } from "../app-nav";

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value
}));

const items = [
  { href: "/", label: "Home" },
  { href: "/transactions", label: "Transactions" }
] as const;
const iconItems = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/transactions", label: "Transactions", icon: "≡" }
] as const;

describe("AppNav", () => {
  beforeEach(() => {
    pathname.value = "/";
  });

  it("marks the current sidebar item and links every item", () => {
    render(<AppNav items={items} orientation="sidebar" />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("bg-surface-muted");
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions"
    );
  });

  it("uses the compact active treatment in bottom navigation", () => {
    pathname.value = "/transactions";
    render(<AppNav items={items} orientation="bottom" />);

    expect(screen.getByRole("link", { name: "Transactions" })).toHaveClass("text-accent");
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("text-foreground-muted");
  });

  it("renders icon-first navigation when the sidebar is compact", () => {
    render(<AppNav items={iconItems} orientation="sidebar" compact />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("title", "Home");
    expect(screen.getByText("⌂")).toBeVisible();
  });

  it("renders icons in the mobile navigation", () => {
    render(<AppNav items={iconItems} orientation="bottom" />);

    expect(screen.getByText("≡")).toBeVisible();
  });
});
