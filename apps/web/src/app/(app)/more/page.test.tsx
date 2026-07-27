import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import MorePage from "./page";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: Readonly<{ children: ReactNode; href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("MorePage", () => {
  it("links to every main navigation section", () => {
    render(<MorePage />);

    expect(screen.getByRole("link", { name: /Budgets/ })).toHaveAttribute("href", "/budgets");
    expect(screen.getByRole("link", { name: /Goals/ })).toHaveAttribute("href", "/goals");
    expect(screen.getByRole("link", { name: /Patterns/ })).toHaveAttribute(
      "href",
      "/spending-warnings"
    );
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
  });
});
