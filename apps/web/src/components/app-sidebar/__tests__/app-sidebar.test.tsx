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
});
