import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "../app-header";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  privacyMode: false,
  togglePrivacyMode: vi.fn()
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  )
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));

vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>
}));
vi.mock("@/features/transactions/components/create-txn-sheet", () => ({
  CreateTxnSheet: () => <div role="dialog" aria-label="New transaction" />
}));
vi.mock("@/lib/privacy/privacy-context", () => ({
  usePrivacy: () => ({
    privacyMode: mocks.privacyMode,
    togglePrivacyMode: mocks.togglePrivacyMode
  })
}));

describe("AppHeader", () => {
  beforeEach(() => {
    mocks.pathname = "/";
    mocks.privacyMode = false;
    mocks.togglePrivacyMode.mockReset();
  });

  it("uses eye and eye-off icons for privacy mode", () => {
    const { rerender } = render(<AppHeader email="harsh@example.com" theme="light" />);

    expect(
      screen.getByRole("button", { name: "Enable privacy mode" }).querySelector("svg")
    ).toHaveClass("lucide-eye");

    mocks.privacyMode = true;
    rerender(<AppHeader email="harsh@example.com" theme="light" />);

    expect(
      screen.getByRole("button", { name: "Disable privacy mode" }).querySelector("svg")
    ).toHaveClass("lucide-eye-off");
    expect(screen.queryByText("🙈")).toBeNull();
  });

  it("shows the Settings icon", () => {
    mocks.pathname = "/settings";
    render(<AppHeader email="harsh@example.com" theme={null} />);

    const routeLabel = screen.getByText("Settings");
    expect(routeLabel.parentElement?.querySelector('[aria-hidden="true"]')).toHaveTextContent("⚙");
  });

  it("labels the recurring transactions route", () => {
    mocks.pathname = "/recurring";
    render(<AppHeader email="harsh@example.com" theme={null} />);

    expect(screen.getByText("Recurring transactions")).toBeVisible();
  });

  it("uses the parent label for nested routes", () => {
    mocks.pathname = "/transactions/txn-1";
    render(<AppHeader email="harsh@example.com" theme={null} />);

    expect(screen.getByText("Transactions")).toBeVisible();
  });

  it("shows a clear Add label and does not reserve the browser new-window shortcut", async () => {
    const user = userEvent.setup();
    render(<AppHeader email="harsh@example.com" theme={null} />);

    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).toBeVisible();
    expect(screen.queryByText("⌘N")).toBeNull();

    fireEvent.keyDown(window, { key: "n", metaKey: true });
    expect(screen.queryByRole("dialog", { name: "New transaction" })).toBeNull();

    await user.click(addButton);
    expect(screen.getByRole("dialog", { name: "New transaction" })).toBeVisible();
  });
});
