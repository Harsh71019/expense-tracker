import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "../app-sidebar";

vi.mock("../app-nav", () => ({ AppNav: () => <nav>Navigation</nav> }));
vi.mock("../ui/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock("@/features/auth", () => ({ SignOutButton: () => <button>Sign out</button> }));

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
    expect(window.localStorage.getItem("vyaya-sidebar-compact")).toBe("true");
  });

  it("restores the compact preference", () => {
    window.localStorage.setItem("vyaya-sidebar-compact", "true");
    render(<AppSidebar email="harsh@example.com" theme={null} />);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    expect(screen.queryByText("harsh@example.com")).toBeNull();
  });
});
