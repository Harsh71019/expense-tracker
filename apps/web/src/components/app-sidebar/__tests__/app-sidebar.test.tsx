import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../app-sidebar";

vi.mock("../app-nav", () => ({
  AppNav: ({ items }: { items: readonly Readonly<{ href: string; label: string }>[] }) => (
    <nav>
      {items.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
    </nav>
  )
}));
vi.mock("../ui/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));

describe("AppSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows account context and can collapse", async () => {
    const user = userEvent.setup();
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByText("harsh@example.com")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(window.localStorage.getItem("treasury-ops-sidebar-compact")).toBe("true");
  });

  it("restores the compact preference", () => {
    window.localStorage.setItem("treasury-ops-sidebar-compact", "true");
    render(<AppSidebar email="harsh@example.com" theme={null} />);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(screen.queryByText("harsh@example.com")).toBeNull();
  });

  it("links to budgets beside the other planning destinations", () => {
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Budgets" })).toHaveAttribute("href", "/budgets");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
  });
});
