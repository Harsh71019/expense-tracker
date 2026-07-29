import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileMenu } from "../mobile-menu";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: Readonly<{ children: ReactNode; href: string; onClick?: () => void }>) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      {...props}
    >
      {children}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/"
}));

describe("MobileMenu", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("opens the full-screen navigation and closes after choosing a destination", async () => {
    const user = userEvent.setup();
    render(<MobileMenu email="harsh@example.com" />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(screen.getByRole("dialog", { name: "Navigation" })).toHaveClass("h-dvh");
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("link", { name: "Transactions" }));

    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes with Escape and returns focus to the menu button", async () => {
    const user = userEvent.setup();
    render(<MobileMenu email="harsh@example.com" />);

    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
