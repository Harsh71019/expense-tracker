import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNav } from "./app-nav";

const pathname = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Readonly<{ children: string; href: string }>) => (
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
});
