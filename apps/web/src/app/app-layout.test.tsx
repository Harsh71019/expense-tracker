import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "./(app)/layout";

const mocks = vi.hoisted(
  (): {
    redirect: ReturnType<typeof vi.fn>;
    session: { user: { id: string; email: string } } | null;
  } => ({
    redirect: vi.fn(),
    session: { user: { id: "user-1", email: "harsh@example.com" } }
  })
);

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/api/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/lib/theme-server", () => ({ getStoredTheme: async () => "light" }));
vi.mock("@/components/app-nav", () => ({ AppNav: () => <nav>Navigation</nav> }));
vi.mock("@/components/ui/theme-toggle", () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock("@/features/auth", () => ({ SignOutButton: () => <button>Sign out</button> }));

describe("AppLayout", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.session = { user: { id: "user-1", email: "harsh@example.com" } };
  });

  it("renders authenticated app chrome and children", async () => {
    render(
      await AppLayout({
        children: <p>Dashboard content</p>
      })
    );

    expect(screen.getByText("Dashboard content")).toBeVisible();
    expect(screen.getByText("harsh@example.com")).toBeVisible();
    expect(screen.getAllByText("Navigation")).toHaveLength(2);
  });

  it("redirects when the API session is absent", async () => {
    mocks.session = null;
    mocks.redirect.mockImplementation((): never => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(AppLayout({ children: <p>Hidden</p> })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
