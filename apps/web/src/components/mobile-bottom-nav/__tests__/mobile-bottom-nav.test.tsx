import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MobileBottomNav } from "../mobile-bottom-nav";

const mocks = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/features/transactions/components/create-txn-sheet", () => ({
  CreateTxnSheet: ({ onClose }: Readonly<{ onClose: () => void }>) => (
    <div role="dialog" aria-label="New transaction">
      <button type="button" onClick={onClose}>
        Close sheet
      </button>
    </div>
  )
}));

describe("MobileBottomNav", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("renders the approved one-thumb destinations and marks the current route", () => {
    render(<MobileBottomNav />);

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    const home = screen.getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home).toHaveClass("bg-accent-glow");
    expect(home.querySelector("svg")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions"
    );
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/more");
  });

  it("opens and closes the existing transaction sheet from the center action", async () => {
    const user = userEvent.setup();
    render(<MobileBottomNav />);

    await user.click(screen.getByRole("button", { name: "Add transaction" }));
    expect(screen.getByRole("dialog", { name: "New transaction" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close sheet" }));
    expect(screen.queryByRole("dialog", { name: "New transaction" })).toBeNull();
  });

  it("keeps Transactions active on a detail route", () => {
    mocks.pathname = "/transactions/txn-1";
    render(<MobileBottomNav />);

    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });
});
