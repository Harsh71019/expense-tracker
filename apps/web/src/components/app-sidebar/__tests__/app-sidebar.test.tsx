import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../app-sidebar";

const pathname = vi.hoisted((): { value: string } => ({ value: "/" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));
vi.mock("../ui/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));

describe("AppSidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname.value = "/";
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

  it("adds Patterns to the sidebar adjacent to Reports", () => {
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const hrefs = [...nav.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    const reportsIndex = hrefs.indexOf("/reports");
    const patternsIndex = hrefs.indexOf("/spending-warnings");

    expect(patternsIndex).toBeGreaterThan(-1);
    expect(patternsIndex).toBe(reportsIndex + 1);
    expect(screen.getByRole("link", { name: "Patterns" })).toHaveAttribute(
      "href",
      "/spending-warnings"
    );
  });

  it("highlights Patterns when on the spending-warnings route", () => {
    pathname.value = "/spending-warnings";
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Patterns" })).toHaveClass("bg-accent-glow");
    expect(screen.getByRole("link", { name: "Reports" })).not.toHaveClass("bg-accent-glow");
  });

  it("links to budgets beside the other planning destinations", () => {
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Budgets" })).toHaveAttribute("href", "/budgets");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
  });

  it("includes every top-level desktop destination in the rearrangeable navigation", () => {
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Add transaction" })).toHaveAttribute("href", "/add");
    expect(screen.getByRole("link", { name: "Credit card bills" })).toHaveAttribute(
      "href",
      "/bills"
    );
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/export");
    expect(screen.getByRole("link", { name: "API keys" })).toHaveAttribute(
      "href",
      "/settings/api-keys"
    );
  });

  it("shows recurring transactions and keeps Settings available when compact", async () => {
    const user = userEvent.setup();
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Recurring transactions" })).toHaveAttribute(
      "href",
      "/recurring"
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");

    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("link", { name: "Recurring transactions" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  it("renders Edit sidebar button and toggles edit mode", async () => {
    const user = userEvent.setup();
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    const editBtn = screen.getByRole("button", { name: "Edit sidebar" });
    expect(editBtn).toBeVisible();

    await user.click(editBtn);

    expect(screen.getByRole("list", { name: "Reorder navigation items" })).toBeVisible();
    const doneBtn = screen.getByRole("button", { name: "Done editing sidebar" });
    expect(doneBtn).toBeVisible();

    await user.click(doneBtn);
    expect(screen.queryByRole("list", { name: "Reorder navigation items" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  });

  it("expands the sidebar before entering edit mode so rearrangement controls fit", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("treasury-ops-sidebar-compact", "true");
    render(<AppSidebar email="harsh@example.com" theme="light" />);

    await user.click(screen.getByRole("button", { name: "Edit sidebar" }));

    expect(screen.getByText("Dashboard")).toBeVisible();
    expect(window.localStorage.getItem("treasury-ops-sidebar-compact")).toBe("false");
  });

  it("hides items configured as invisible in localStorage", () => {
    const prefs = {
      version: 1,
      items: [
        { href: "/", visible: true },
        { href: "/accounts", visible: false },
        { href: "/transactions", visible: true }
      ]
    };
    window.localStorage.setItem("treasury-ops-nav-prefs", JSON.stringify(prefs));

    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Accounts" })).toBeNull();
  });

  it("exposes all items including hidden ones in edit mode", async () => {
    const user = userEvent.setup();
    const prefs = {
      version: 1,
      items: [
        { href: "/", visible: true },
        { href: "/accounts", visible: false }
      ]
    };
    window.localStorage.setItem("treasury-ops-nav-prefs", JSON.stringify(prefs));

    render(<AppSidebar email="harsh@example.com" theme="light" />);

    expect(screen.queryByRole("link", { name: "Accounts" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit sidebar" }));

    expect(screen.getByRole("button", { name: "Show Accounts" })).toBeVisible();
  });
});
